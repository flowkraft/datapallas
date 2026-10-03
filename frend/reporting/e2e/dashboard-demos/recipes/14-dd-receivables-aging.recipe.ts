// Dashboard Demo 14, Receivables Aging & Collections: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-receivables-aging, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-receivables-aging',
  nn: 14,
  title: 'Receivables Aging & Collections',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'minAmount', type: 'Double', label: 'Minimum amount', defaultValue: 0) {
    constraints(required: true)
    ui(control: 'text')
  }
  parameter(id: 'accountManagerId', type: 'Integer', label: 'Account manager') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All managers --\\' AS label UNION ALL SELECT CAST(e.employee_id AS VARCHAR) AS value, e.name AS label FROM dash_demo.employees e WHERE EXISTS (SELECT 1 FROM dash_demo.customers c WHERE c.account_manager_id = e.employee_id) ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Minimum amount, Account manager).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd14-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Receivables Aging & Collections

Helix Retail Group owes 170,829.65 past 90 days - four invoices, and the whole of the 90+ bucket; DSO averages 50.3 days over 2026 against 43.4 in 2025.

The call list is read from the top: how bad it is and which way it is going, then how old the debt is and in which segment, then the customers to call and their invoices. Raise **Minimum amount** to leave only the arrears worth a call, and pick an account manager to work one book at a time. DSO is a company number and does not follow either filter.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-kpi-overdue-90-plus',
      table: 'dash_demo.invoices',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(coalesce(sum(i.amount + i.tax_amount), 0), 2) AS overdue_90_plus
FROM dash_demo.invoices i
JOIN dash_demo.customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('open', 'overdue', 'partially_paid')
  AND i.amount + i.tax_amount >= \${minAmount}
  AND c.account_manager_id = \${accountManagerId}
  AND i.due_date < (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 90 DAY`,
      shot: {
        title: 'The query for overdue 90 plus',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show overdue 90 plus as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'overdue_90_plus', numberLabel: 'Overdue 90+ days', numberFormat: 'currency' },
      shot: {
        title: 'Set up overdue 90 plus',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-gauge-current-not-overdue',
      table: 'dash_demo.as_of',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(CASE WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a)
                      THEN i.amount + i.tax_amount ELSE 0 END)
             / sum(i.amount + i.tax_amount), 4) AS current_not_overdue
FROM dash_demo.invoices i
JOIN dash_demo.customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('open', 'overdue', 'partially_paid')
  AND i.amount + i.tax_amount >= \${minAmount}
  AND c.account_manager_id = \${accountManagerId}`,
      shot: {
        title: 'The query for current not overdue',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show current not overdue as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'current_not_overdue',
        min: 0,
        max: 1,
        label: 'Current, not overdue',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 0.8, color: '#ef8c8c' }, { to: 0.9, color: '#f9d45c' }, { to: 1, color: '#88bf4d' }],
      },
      shot: {
        title: 'Set up current not overdue',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-trend-dso',
      table: 'dash_demo.as_of',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// DSO per month: receivables still outstanding at the end of the month, over the credit sales of
// the year to that day, times 365 days. Two sums read at 24 different days is not one grouped query,
// which is why this widget asks it itself. It is a company number: the page's two filters pick whom
// to call today and do not change how long the company waits to be paid.
dbSql.rows("""WITH months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a))
              - to_months(CAST(s.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 23) AS s(i)
),
month_end AS (
  SELECT month,
         CAST(least(month + to_months(1) - to_days(1),
                    (SELECT a.as_of FROM dash_demo.as_of a)) AS DATE) AS read_at
  FROM months
)
SELECT m.month AS month,
       round(365.0
             * (SELECT sum(i.amount + i.tax_amount) FROM dash_demo.invoices i
                WHERE i.issue_date <= m.read_at
                  AND (i.last_paid_date IS NULL OR i.last_paid_date > m.read_at))
             / (SELECT sum(i.amount + i.tax_amount) FROM dash_demo.invoices i
                WHERE i.issue_date > m.read_at - to_days(365)
                  AND i.issue_date <= m.read_at), 2) AS dso_days
FROM month_end m
ORDER BY m.month""", [])`,
      shot: {
        title: 'The script for dso',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: { title: 'Show dso as trend', caption: 'Under **Visualize as**, choose **trend**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: { dateField: 'month', valueField: 'dso_days', format: 'number', label: 'DSO per month, days' },
      shot: {
        title: 'Set up dso',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-kpi-customers-overdue',
      table: 'dash_demo.invoices',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(DISTINCT i.customer_id) AS customers_overdue
FROM dash_demo.invoices i
JOIN dash_demo.customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('open', 'overdue', 'partially_paid')
  AND i.amount + i.tax_amount >= \${minAmount}
  AND c.account_manager_id = \${accountManagerId}
  AND i.due_date < (SELECT a.as_of FROM dash_demo.as_of a)`,
      shot: {
        title: 'The query for customers overdue',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show customers overdue as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'customers_overdue', numberLabel: 'Customers overdue', numberFormat: 'number' },
      shot: {
        title: 'Set up customers overdue',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-chart-aging-buckets',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH aged AS (
  SELECT CASE WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) THEN 0
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 30 DAY THEN 1
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 60 DAY THEN 2
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 90 DAY THEN 3
              ELSE 4 END AS ord,
         c.segment AS segment,
         i.amount + i.tax_amount AS owed
  FROM dash_demo.invoices i
  JOIN dash_demo.customers c ON c.customer_id = i.customer_id
  WHERE i.status IN ('open', 'overdue', 'partially_paid')
    AND i.amount + i.tax_amount >= \${minAmount}
    AND c.account_manager_id = \${accountManagerId}
)
SELECT CASE ord WHEN 0 THEN 'Current' WHEN 1 THEN '1-30 days' WHEN 2 THEN '31-60 days'
         WHEN 3 THEN '61-90 days' ELSE '90+ days' END AS bucket,
       round(sum(owed), 2) AS owed,
       count(*) AS invoices
FROM aged
GROUP BY ord
ORDER BY ord`,
      shot: {
        title: 'The query for aging buckets',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show aging buckets as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'bucket', datasets: [{ field: 'owed', label: 'Owed' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Aging buckets: current, 1-30, 31-60, 61-90, 90+' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'bucket'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Aging buckets: current, 1-30, 31-60, 61-90, 90+'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up aging buckets',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-chart-aging-by-segment',
      table: 'dash_demo.as_of',
      grid: { x: 6, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH aged AS (
  SELECT CASE WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) THEN 0
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 30 DAY THEN 1
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 60 DAY THEN 2
              WHEN i.due_date >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 90 DAY THEN 3
              ELSE 4 END AS ord,
         c.segment AS segment,
         i.amount + i.tax_amount AS owed
  FROM dash_demo.invoices i
  JOIN dash_demo.customers c ON c.customer_id = i.customer_id
  WHERE i.status IN ('open', 'overdue', 'partially_paid')
    AND i.amount + i.tax_amount >= \${minAmount}
    AND c.account_manager_id = \${accountManagerId}
)
SELECT CASE ord WHEN 0 THEN 'Current' WHEN 1 THEN '1-30 days' WHEN 2 THEN '31-60 days'
         WHEN 3 THEN '61-90 days' ELSE '90+ days' END AS bucket,
       segment AS segment,
       round(sum(owed), 2) AS owed
FROM aged
GROUP BY ord, segment
ORDER BY ord, segment`,
      shot: {
        title: 'The query for aging by segment',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show aging by segment as chart',
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
            labelField: 'bucket',
            seriesField: 'segment',
            datasets: [{ field: 'owed', label: 'Owed' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Aging by segment' } },
            scales: { x: { stacked: true }, y: { stacked: true } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'bucket'
    seriesField 'segment'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Aging by segment'
      }
    }
    scales {
      x {
        stacked true
      }
      y {
        stacked true
      }
    }
  }
}
`,
      shot: {
        title: 'Set up aging by segment',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-chart-top-10-overdue-customers',
      table: 'dash_demo.invoices',
      grid: { x: 0, y: 8, w: 5, h: 4 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT c.name AS customer,
       round(sum(i.amount + i.tax_amount), 2) AS owed
FROM dash_demo.invoices i
JOIN dash_demo.customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('open', 'overdue', 'partially_paid')
  AND i.amount + i.tax_amount >= \${minAmount}
  AND c.account_manager_id = \${accountManagerId}
  AND i.due_date < (SELECT a.as_of FROM dash_demo.as_of a)
GROUP BY c.name
ORDER BY owed DESC
LIMIT 10`,
      shot: {
        title: 'The query for top 10 overdue customers',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show top 10 overdue customers as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'customer', datasets: [{ field: 'owed', label: 'Owed' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Top 10 overdue customers' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'customer'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Top 10 overdue customers'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up top 10 overdue customers',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd14-table-overdue-invoices',
      table: 'dash_demo.as_of',
      grid: { x: 5, y: 8, w: 7, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT i.invoice_no AS invoice_no,
       c.name AS customer,
       i.issue_date AS issued,
       i.due_date AS due,
       CAST((SELECT a.as_of FROM dash_demo.as_of a) - i.due_date AS INTEGER) AS days_overdue,
       round(i.amount + i.tax_amount, 2) AS owed,
       i.status AS status
FROM dash_demo.invoices i
JOIN dash_demo.customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('open', 'overdue', 'partially_paid')
  AND i.amount + i.tax_amount >= \${minAmount}
  AND c.account_manager_id = \${accountManagerId}
  AND i.due_date < (SELECT a.as_of FROM dash_demo.as_of a)
ORDER BY days_overdue DESC`,
      shot: {
        title: 'The query for overdue invoices',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show overdue invoices as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: {
        dslConfig: {
          layout: 'fitColumns',
          autoColumns: true,
          pagination: true,
          paginationSize: 12,
          theme: 'midnight',
        },
        columnSettings: {
          invoice_no: { columnTitle: 'Invoice' },
          days_overdue: { columnTitle: 'Days overdue' },
          owed: { columnTitle: 'Owed' },
        },
      },
      shot: {
        title: 'Set up overdue invoices',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 3, h: 3 },
        { x: 3, y: 1, w: 3, h: 3 },
        { x: 6, y: 1, w: 3, h: 3 },
        { x: 9, y: 1, w: 3, h: 3 },
        { x: 0, y: 4, w: 6, h: 4 },
        { x: 6, y: 4, w: 6, h: 4 },
        { x: 0, y: 8, w: 5, h: 4 },
        { x: 5, y: 8, w: 7, h: 4 },
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

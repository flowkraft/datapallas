// Dashboard Demo 10, Cohort Retention: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-cohort-retention, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-cohort-retention',
  nn: 10,
  title: 'Cohort Retention',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'customerType', type: 'String', label: 'Customer type', defaultValue: 'all') {
    constraints(required: true)
    ui(control: 'radio', options: 'SELECT \\'all\\' AS value, \\'All\\' AS label UNION ALL SELECT DISTINCT customer_type AS value, customer_type AS label FROM dash_demo.customers ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Customer type).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd10-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Cohort Retention

Cohorts from March 2025 still have 48% of their customers ordering around month 6, about 7 points more than the cohorts before it.

A cohort counts as retained at a period when it ordered in the window around it: the month either side for the monthly cohorts, the quarter either side for the quarterly business ones. Business accounts are read by quarter because they are fewer and larger - a monthly business cohort is small enough for one account to move a cell by three points.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd10-pivot-cohorts',
      table: 'dash_demo.customers',
      grid: { x: 0, y: 1, w: 12, h: 6 },
      shot: {
        title: 'Start a widget on customers',
        caption: 'In the schema browser, pick **customers**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH base AS (
  SELECT c.customer_id AS customer_id,
         c.signup_date AS signup_date,
         CASE WHEN \${customerType} = 'business'
              THEN CAST(year(c.signup_date) AS VARCHAR) || ' Q' || CAST(quarter(c.signup_date) AS VARCHAR)
              ELSE strftime(date_trunc('month', c.signup_date), '%Y-%m') END AS cohort,
         CASE WHEN \${customerType} = 'business' THEN 3 ELSE 1 END AS step
  FROM dash_demo.customers c
  WHERE true
  AND (\${customerType} = 'all' OR c.customer_type = \${customerType})
),
periods AS (SELECT unnest(range(1, 13)) AS n)
SELECT b.cohort AS cohort,
       lpad(CAST(p.n AS VARCHAR), 2, '0') AS periods_since_signup,
       round(100.0 * count(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM dash_demo.orders o
                                  WHERE o.customer_id = b.customer_id
                                    AND o.status <> 'cancelled'
                                    AND o.order_ts >= b.signup_date + (p.n - 1) * b.step * INTERVAL 1 MONTH
                                    AND o.order_ts < b.signup_date + (p.n + 1) * b.step * INTERVAL 1 MONTH)
                                THEN b.customer_id END)
                   / count(DISTINCT b.customer_id), 2) AS retention_pct
FROM base b
CROSS JOIN periods p
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for cohorts',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: { title: 'Show cohorts as pivot', caption: 'Under **Visualize as**, choose **pivot**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'pivot',
      config: {},
      dsl: `pivotTable {
  rows([
    'cohort'
  ])
  cols([
    'periods_since_signup'
  ])
  vals([
    'retention_pct'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}
`,
      shot: {
        title: 'Set up cohorts',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd10-chart-retention-curve',
      table: 'dash_demo.customers',
      grid: { x: 0, y: 7, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on customers',
        caption: 'In the schema browser, pick **customers**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH base AS (
  SELECT c.customer_id AS customer_id,
         c.signup_date AS signup_date,
         1 AS step,
         CASE WHEN c.signup_date < DATE '2025-03-01' THEN 'before March 2025'
              ELSE 'from March 2025' END AS cohort_group
  FROM dash_demo.customers c
  WHERE ((c.signup_date >= DATE '2024-03-01' AND c.signup_date < DATE '2025-01-01')
      OR (c.signup_date >= DATE '2025-03-01' AND c.signup_date < DATE '2026-01-01'))
  AND (\${customerType} = 'all' OR c.customer_type = \${customerType})
),
periods AS (SELECT unnest(range(1, 13)) AS n)
SELECT p.n AS month_since_signup,
       b.cohort_group AS cohort_group,
       round(100.0 * count(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM dash_demo.orders o
                                  WHERE o.customer_id = b.customer_id
                                    AND o.status <> 'cancelled'
                                    AND o.order_ts >= b.signup_date + (p.n - 1) * b.step * INTERVAL 1 MONTH
                                    AND o.order_ts < b.signup_date + (p.n + 1) * b.step * INTERVAL 1 MONTH)
                                THEN b.customer_id END)
                   / count(DISTINCT b.customer_id), 2) AS retention_pct
FROM base b
CROSS JOIN periods p
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for retention curve',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show retention curve as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: {
            labelField: 'month_since_signup',
            seriesField: 'cohort_group',
            datasets: [{ field: 'retention_pct', label: 'Still ordering %' }],
          },
          options: {
            plugins: {
              title: { display: true, text: 'Retention curve: the ten months either side of March 2025' },
            },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month_since_signup'
    seriesField 'cohort_group'
    datasets {
      dataset {
        field 'retention_pct'
        label 'Still ordering %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Retention curve: the ten months either side of March 2025'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up retention curve',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd10-number-average-6-month-retention',
      table: 'dash_demo.orders',
      grid: { x: 8, y: 7, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(1.0 * count(CASE WHEN EXISTS (SELECT 1 FROM dash_demo.orders o
                                           WHERE o.customer_id = c.customer_id
                                             AND o.status <> 'cancelled'
                                             AND o.order_ts >= c.signup_date + INTERVAL 5 MONTH
                                             AND o.order_ts < c.signup_date + INTERVAL 7 MONTH)
                          THEN 1 END) / count(*), 4) AS retention_pct
FROM dash_demo.customers c
WHERE c.signup_date >= DATE '2024-01-01'
  AND c.signup_date < DATE '2026-04-01'
  AND (\${customerType} = 'all' OR c.customer_type = \${customerType})`,
      shot: {
        title: 'The query for average 6 month retention',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show average 6 month retention as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'retention_pct',
        numberLabel: 'Average 6-month retention',
        numberFormat: 'percent',
      },
      shot: {
        title: 'Set up average 6 month retention',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 12, h: 6 },
        { x: 0, y: 7, w: 8, h: 4 },
        { x: 8, y: 7, w: 4, h: 2 },
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

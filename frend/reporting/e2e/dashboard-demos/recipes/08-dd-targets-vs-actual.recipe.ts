// Dashboard Demo 08, Targets vs Actual: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-targets-vs-actual, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-targets-vs-actual',
  nn: 8,
  title: 'Targets vs Actual',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'year', type: 'Date', label: 'Year', defaultValue: '{dataToday:startOf year}') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT CAST(date_trunc(\\'year\\', month) AS VARCHAR) AS value, CAST(year(month) AS VARCHAR) AS label FROM dash_demo.sales_targets ORDER BY value DESC')
  }
  parameter(id: 'region', type: 'String', label: 'Region') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \\'\\' AS value, \\'-- All regions --\\' AS label UNION ALL SELECT DISTINCT region AS value, region AS label FROM dash_demo.sales_targets ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Year, Region).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd08-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Targets vs Actual

EMEA is at 103% of target and APAC at 85%, with NA and LATAM on plan.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-progress-emea',
      table: 'dash_demo.sales_targets',
      grid: { x: 0, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(a.actual) / sum(t.revenue_target), 4) AS pct_of_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = 'EMEA'`,
      shot: {
        title: 'The query for emea',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: { title: 'Show emea as progress', caption: 'Under **Visualize as**, choose **progress**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'EMEA vs target', format: 'percent' },
      shot: {
        title: 'Set up emea',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-progress-na',
      table: 'dash_demo.sales_targets',
      grid: { x: 3, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(a.actual) / sum(t.revenue_target), 4) AS pct_of_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = 'NA'`,
      shot: {
        title: 'The query for na',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: { title: 'Show na as progress', caption: 'Under **Visualize as**, choose **progress**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'NA vs target', format: 'percent' },
      shot: {
        title: 'Set up na',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-progress-apac',
      table: 'dash_demo.sales_targets',
      grid: { x: 6, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(a.actual) / sum(t.revenue_target), 4) AS pct_of_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = 'APAC'`,
      shot: {
        title: 'The query for apac',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: { title: 'Show apac as progress', caption: 'Under **Visualize as**, choose **progress**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'APAC vs target', format: 'percent' },
      shot: {
        title: 'Set up apac',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-progress-latam',
      table: 'dash_demo.sales_targets',
      grid: { x: 9, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(a.actual) / sum(t.revenue_target), 4) AS pct_of_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = 'LATAM'`,
      shot: {
        title: 'The query for latam',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: { title: 'Show latam as progress', caption: 'Under **Visualize as**, choose **progress**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'LATAM vs target', format: 'percent' },
      shot: {
        title: 'Set up latam',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-chart-monthly-revenue-vs-target',
      table: 'dash_demo.sales_targets',
      grid: { x: 0, y: 3, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(t.month, '%Y-%m') AS month,
       round(sum(a.actual), 2) AS actual,
       round(sum(t.revenue_target), 2) AS revenue_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = \${region}
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for monthly revenue vs target',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show monthly revenue vs target as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'combo',
          data: {
            labelField: 'month',
            datasets: [{ field: 'actual', label: 'Actual' }, { field: 'revenue_target', label: 'Target' }],
          },
          options: { plugins: { title: { display: true, text: 'Monthly revenue vs target' } } },
        },
      },
      dsl: `chart {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'actual'
        label 'Actual'
      }
      dataset {
        field 'revenue_target'
        label 'Target'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Monthly revenue vs target'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up monthly revenue vs target',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-gauge-ytd-attainment',
      table: 'dash_demo.sales_targets',
      grid: { x: 8, y: 3, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(a.actual) / sum(t.revenue_target), 4) AS pct_of_target
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
  AND t.region = \${region}`,
      shot: {
        title: 'The query for ytd attainment',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show ytd attainment as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'pct_of_target',
        min: 0,
        max: 1.5,
        label: 'YTD attainment',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 1, color: '#c62828' }, { to: 1.5, color: '#2e7d32' }],
      },
      shot: {
        title: 'Set up ytd attainment',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd08-pivot-variance-by-region-month',
      table: 'dash_demo.sales_targets',
      grid: { x: 0, y: 7, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on sales_targets',
        caption: 'In the schema browser, pick **sales_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT t.region AS region,
       strftime(t.month, '%Y-%m') AS month,
       round(100.0 * (coalesce(a.actual, 0) - t.revenue_target)
                   / t.revenue_target, 2) AS variance_pct
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m,
                  g.region AS region,
                  sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2
          ) a ON a.m = t.month AND a.region = t.region
WHERE year(t.month) = year(CAST(\${year} AS DATE))
ORDER BY 1, 2`,
      shot: {
        title: 'The query for variance by region month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: {
        title: 'Show variance by region month as pivot',
        caption: 'Under **Visualize as**, choose **pivot**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'pivot',
      config: {},
      dsl: `pivotTable {
  rows([
    'region'
  ])
  cols([
    'month'
  ])
  vals([
    'variance_pct'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}
`,
      shot: {
        title: 'Set up variance by region month',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
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
        { x: 0, y: 3, w: 8, h: 4 },
        { x: 8, y: 3, w: 4, h: 4 },
        { x: 0, y: 7, w: 12, h: 4 },
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

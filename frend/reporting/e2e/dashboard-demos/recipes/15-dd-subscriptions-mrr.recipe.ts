// Dashboard Demo 15, Subscriptions: MRR & Churn: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-subscriptions-mrr, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-subscriptions-mrr',
  nn: 15,
  title: 'Subscriptions: MRR & Churn',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'plan', type: 'String', label: 'Plan', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT s.plan AS value, s.plan AS label FROM dash_demo.subscriptions s ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Plan).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd15-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Subscriptions: MRR & Churn

February 2026 was the worst month of the year for retention - every cohort kept less of itself, and price is the reason 86 subscribers gave when they left - yet MRR is at a new high of 99,781.43, with 8,102.58 of it won back by expansion over the last 12 months.

Recurring revenue from the top: where MRR is and which way it is going, how many subscribers carry it, and how many left last month. Then what moved MRR over the year and why people left; then which plans hold the revenue, and whether the price change hit the older cohorts as well as the new ones. Pick one or more **plans** to read a single price point: the price change did not hit every plan alike.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-trend-mrr',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 1, w: 5, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(CAST(g.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 11) AS g(i)
),
month_end AS (
  SELECT month,
         CAST(least(month + to_months(1) - to_days(1), (SELECT a.as_of FROM dash_demo.as_of a)) AS DATE) AS read_at
  FROM months
)
SELECT m.month AS month,
       round(sum(s.mrr), 2) AS mrr
FROM month_end m
JOIN dash_demo.subscriptions s
  ON s.start_date <= m.read_at
 AND (s.cancel_date IS NULL OR s.cancel_date > m.read_at)
WHERE true
  AND s.plan IN (\${plan})
GROUP BY m.month
ORDER BY m.month`,
      shot: {
        title: 'The query for mrr',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: { title: 'Show mrr as trend', caption: 'Under **Visualize as**, choose **trend**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: { dateField: 'month', valueField: 'mrr', format: 'currency', label: 'MRR per month' },
      shot: {
        title: 'Set up mrr',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-kpi-active-subscribers',
      table: 'dash_demo.subscriptions',
      grid: { x: 5, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on subscriptions',
        caption: 'In the schema browser, pick **subscriptions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS active_subscribers
FROM dash_demo.subscriptions s
WHERE true
  AND s.plan IN (\${plan})
  AND s.cancel_date IS NULL`,
      shot: {
        title: 'The query for active subscribers',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show active subscribers as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'active_subscribers',
        numberLabel: 'Active subscribers',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up active subscribers',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-gauge-churn-last-month',
      table: 'dash_demo.as_of',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(count(*) FILTER (WHERE date_trunc('month', s.cancel_date) = date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)))
             / count(*)::DOUBLE, 4) AS churn_last_month
FROM dash_demo.subscriptions s
WHERE true
  AND s.plan IN (\${plan})
  AND s.start_date < date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a))
  AND (s.cancel_date IS NULL OR s.cancel_date >= date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)))`,
      shot: {
        title: 'The query for churn last month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show churn last month as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'churn_last_month',
        min: 0,
        max: 0.05,
        label: 'Churn last month',
        gaugeFormat: 'percent',
        gaugeBands: [
          { to: 0.01, color: '#ef8c8c' },
          { to: 0.02, color: '#f9d45c' },
          { to: 0.05, color: '#88bf4d' },
        ],
        gaugeBandsReverse: true,
      },
      shot: {
        title: 'Set up churn last month',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-chart-waterfall-mrr-movement',
      table: 'dash_demo.subscription_changes',
      grid: { x: 0, y: 4, w: 8, h: 5 },
      shot: {
        title: 'Start a widget on subscription_changes',
        caption: 'In the schema browser, pick **subscription_changes**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// What moved MRR over the last 12 months, in the order a reader follows: what came in, what grew,
// what came back, what shrank, what left. The plan filter arrives as the comma-separated text of the
// plans the viewer chose, so it is read into rows first - with nothing chosen there are no rows and
// every plan counts.
dbSql.rows("""WITH chosen AS (
  SELECT trim(p) AS plan
  FROM unnest(string_split(?, ',')) AS t(p)
  WHERE trim(p) <> ''
)
SELECT CASE ch.change_type
         WHEN 'new' THEN 'New'
         WHEN 'expansion' THEN 'Expansion'
         WHEN 'reactivation' THEN 'Reactivation'
         WHEN 'contraction' THEN 'Contraction'
         ELSE 'Churn' END AS movement,
       round(sum(ch.mrr_delta), 2) AS mrr_delta
FROM dash_demo.subscription_changes ch
JOIN dash_demo.subscriptions s ON s.subscription_id = ch.subscription_id
WHERE ch.change_date > (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 12 MONTH
  AND (NOT EXISTS (SELECT 1 FROM chosen) OR s.plan IN (SELECT plan FROM chosen))
GROUP BY movement
ORDER BY CASE movement
           WHEN 'New' THEN 1
           WHEN 'Expansion' THEN 2
           WHEN 'Reactivation' THEN 3
           WHEN 'Contraction' THEN 4
           ELSE 5 END""", [plan])`,
      shot: {
        title: 'The script for waterfall mrr movement',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show waterfall mrr movement as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'waterfall',
          data: { labelField: 'movement', datasets: [{ field: 'mrr_delta', label: 'MRR movement' }] },
          options: { plugins: { title: { display: true, text: 'MRR movement over the last 12 months' } } },
        },
      },
      dsl: `chart {
  type 'waterfall'
  data {
    labelField 'movement'
    datasets {
      dataset {
        field 'mrr_delta'
        label 'MRR movement'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'MRR movement over the last 12 months'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up waterfall mrr movement',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-chart-churn-reasons',
      table: 'dash_demo.subscriptions',
      grid: { x: 8, y: 4, w: 4, h: 5 },
      shot: {
        title: 'Pick the subscriptions table',
        caption: 'In the schema browser, pick **subscriptions**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'equals', value: 'cancelled' },
          { column: 'plan', operator: 'in', value: '${plan}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'subscription_id' }],
        groupBy: ['cancel_reason'],
        sort: [{ column: 'subscription_id_count', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for churn reasons',
        caption: 'Fill the Visual tab: **Summarize → Count of subscription_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show churn reasons as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: {
            labelField: 'cancel_reason',
            datasets: [{ field: 'subscription_id_count', label: 'Subscribers' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Churn reasons' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'cancel_reason'
    datasets {
      dataset {
        field 'subscription_id_count'
        label 'Subscribers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Churn reasons'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up churn reasons',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-chart-mrr-by-plan',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(CAST(g.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 11) AS g(i)
),
month_end AS (
  SELECT month,
         CAST(least(month + to_months(1) - to_days(1), (SELECT a.as_of FROM dash_demo.as_of a)) AS DATE) AS read_at
  FROM months
)
SELECT strftime(m.month, '%Y-%m') AS month,
       s.plan AS plan,
       round(sum(s.mrr), 2) AS mrr
FROM month_end m
JOIN dash_demo.subscriptions s
  ON s.start_date <= m.read_at
 AND (s.cancel_date IS NULL OR s.cancel_date > m.read_at)
WHERE true
  AND s.plan IN (\${plan})
GROUP BY m.month, s.plan
ORDER BY m.month, s.plan`,
      shot: {
        title: 'The query for mrr by plan',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show mrr by plan as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'area',
          data: { labelField: 'month', seriesField: 'plan', datasets: [{ field: 'mrr', label: 'MRR' }] },
          options: { plugins: { title: { display: true, text: 'MRR by plan' } } },
        },
      },
      dsl: `chart {
  type 'area'
  data {
    labelField 'month'
    seriesField 'plan'
    datasets {
      dataset {
        field 'mrr'
        label 'MRR'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'MRR by plan'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up mrr by plan',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd15-pivot-subscriber-cohorts',
      table: 'dash_demo.as_of',
      grid: { x: 6, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(CAST(g.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 11) AS g(i)
)
SELECT year(s.start_date) || ' Q' || quarter(s.start_date) AS cohort,
       strftime(m.month, '%Y-%m') AS month,
       round(100.0 * count(*) FILTER (WHERE s.cancel_date IS NULL
                                        OR s.cancel_date >= m.month + to_months(1))
             / count(*), 1) AS retained_pct
FROM months m
JOIN dash_demo.subscriptions s
  ON s.start_date < m.month
 AND (s.cancel_date IS NULL OR s.cancel_date >= m.month)
WHERE true
  AND s.plan IN (\${plan})
  AND s.start_date >= DATE '2025-01-01'
GROUP BY cohort, m.month
ORDER BY cohort, m.month`,
      shot: {
        title: 'The query for subscriber cohorts',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: {
        title: 'Show subscriber cohorts as pivot',
        caption: 'Under **Visualize as**, choose **pivot**.',
      },
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
    'month'
  ])
  vals([
    'retained_pct'
  ])
  aggregatorName 'Average'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}
`,
      shot: {
        title: 'Set up subscriber cohorts',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 5, h: 3 },
        { x: 5, y: 1, w: 4, h: 3 },
        { x: 9, y: 1, w: 3, h: 3 },
        { x: 0, y: 4, w: 8, h: 5 },
        { x: 8, y: 4, w: 4, h: 5 },
        { x: 0, y: 9, w: 6, h: 4 },
        { x: 6, y: 9, w: 6, h: 4 },
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

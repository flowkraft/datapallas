// Dashboard Demo 12, Website Traffic & Conversion: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-web-funnel, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-web-funnel',
  nn: 12,
  title: 'Website Traffic & Conversion',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 11 months, startOf month}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'device', type: 'String', label: 'Device', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT device AS value, device AS label FROM dash_demo.web_sessions ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (From, To, Device).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd12-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Website Traffic & Conversion

Mobile checkout to purchase fell from about 62% to 41% in June 2026 - a checkout bug - and was back at 62% in August; email visitors convert at 6.1%, about twice paid social's 2.7%.

**Sessions are sampled 1 in 8**, the way an analytics tool samples them: the table holds 60,000 of about 480,000 real sessions, and the rate is stored with the data. Counts on this page are estimated - the sample times the rate - and every label that shows one says so. Rates are worked out inside the sample, so they do not depend on the rate at all.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-kpi-estimated-sessions',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) * (SELECT a.web_session_sample_rate FROM dash_demo.as_of a) AS estimated_sessions
FROM dash_demo.web_sessions s
WHERE true
  AND s.started_ts >= \${dateFrom}
  AND s.started_ts < \${dateTo__next_day}
  AND s.device IN (\${device})`,
      shot: {
        title: 'The query for estimated sessions',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show estimated sessions as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'estimated_sessions',
        numberLabel: 'Estimated sessions (sampled 1 in 8)',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up estimated sessions',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-gauge-conversion-rate',
      table: 'dash_demo.web_sessions',
      grid: { x: 4, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on web_sessions',
        caption: 'In the schema browser, pick **web_sessions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(count(CASE WHEN s.purchased THEN 1 END) * 1.0 / count(*), 4) AS conversion_rate
FROM dash_demo.web_sessions s
WHERE true
  AND s.started_ts >= \${dateFrom}
  AND s.started_ts < \${dateTo__next_day}
  AND s.device IN (\${device})`,
      shot: {
        title: 'The query for conversion rate',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show conversion rate as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'conversion_rate',
        min: 0,
        max: 0.08,
        label: 'Conversion rate',
        gaugeFormat: 'percent',
        gaugeBands: [
          { to: 0.03, color: '#ef8c8c' },
          { to: 0.05, color: '#f9d45c' },
          { to: 0.08, color: '#88bf4d' },
        ],
      },
      shot: {
        title: 'Set up conversion rate',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-trend-sessions-per-week',
      table: 'dash_demo.web_sessions',
      grid: { x: 7, y: 1, w: 5, h: 3 },
      shot: {
        title: 'Pick the web_sessions table',
        caption: 'In the schema browser, pick **web_sessions**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'started_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'device', operator: 'in', value: '${device}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'session_id' }],
        groupBy: ['started_ts'],
        buckets: { started_ts: 'week' },
        sort: [{ column: 'started_ts', direction: 'ASC' }],
      },
      shot: {
        title: 'Build the query for sessions per week',
        caption: 'Fill the Visual tab: **Summarize → Count of session_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: {
        title: 'Show sessions per week as trend',
        caption: 'Under **Visualize as**, choose **trend**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: {
        dateField: 'started_ts',
        valueField: 'session_id_count',
        format: 'number',
        label: 'Sessions per week (sampled 1 in 8)',
      },
      shot: {
        title: 'Set up sessions per week',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-chart-funnel',
      table: 'dash_demo.web_sessions',
      grid: { x: 0, y: 4, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on web_sessions',
        caption: 'In the schema browser, pick **web_sessions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH scope AS (
  SELECT s.reached_product AS reached_product,
         s.reached_cart AS reached_cart,
         s.reached_checkout AS reached_checkout,
         s.purchased AS purchased
  FROM dash_demo.web_sessions s
  WHERE true
    AND s.started_ts >= \${dateFrom}
    AND s.started_ts < \${dateTo__next_day}
    AND s.device IN (\${device})
),
steps AS (
  SELECT 1 AS ord, 'Session' AS step, count(*) AS sessions FROM scope
  UNION ALL SELECT 2, 'Reached product', count(CASE WHEN reached_product THEN 1 END) FROM scope
  UNION ALL SELECT 3, 'Reached cart', count(CASE WHEN reached_cart THEN 1 END) FROM scope
  UNION ALL SELECT 4, 'Reached checkout', count(CASE WHEN reached_checkout THEN 1 END) FROM scope
  UNION ALL SELECT 5, 'Purchased', count(CASE WHEN purchased THEN 1 END) FROM scope
)
SELECT step AS step,
       sessions AS sessions,
       round(100.0 * sessions / (SELECT max(sessions) FROM steps), 2) AS pct_of_sessions
FROM steps
ORDER BY ord`,
      shot: {
        title: 'The query for funnel',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show funnel as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'funnel',
          data: {
            labelField: 'step',
            datasets: [{ field: 'sessions', label: 'Sessions (sampled 1 in 8)' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Session to product to cart to checkout to purchase' } },
          },
        },
      },
      dsl: `chart {
  type 'funnel'
  data {
    labelField 'step'
    datasets {
      dataset {
        field 'sessions'
        label 'Sessions (sampled 1 in 8)'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Session to product to cart to checkout to purchase'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up funnel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-chart-sessions-per-week-by-device',
      table: 'dash_demo.web_sessions',
      grid: { x: 6, y: 4, w: 6, h: 5 },
      shot: {
        title: 'Pick the web_sessions table',
        caption: 'In the schema browser, pick **web_sessions**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'started_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'device', operator: 'in', value: '${device}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'session_id' }],
        groupBy: ['started_ts', 'device'],
        buckets: { started_ts: 'week' },
        sort: [{ column: 'started_ts', direction: 'ASC' }],
      },
      shot: {
        title: 'Build the query for sessions per week by device',
        caption: 'Fill the Visual tab: **Summarize → Count of session_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show sessions per week by device as chart',
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
            labelField: 'started_ts',
            seriesField: 'device',
            datasets: [{ field: 'session_id_count', label: 'Sessions' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Sessions per week by device (sampled 1 in 8)' } },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'started_ts'
    seriesField 'device'
    datasets {
      dataset {
        field 'session_id_count'
        label 'Sessions'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Sessions per week by device (sampled 1 in 8)'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up sessions per week by device',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-chart-mobile-checkout-per-month',
      table: 'dash_demo.web_sessions',
      grid: { x: 0, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on web_sessions',
        caption: 'In the schema browser, pick **web_sessions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(date_trunc('month', s.started_ts), '%Y-%m') AS month,
       round(100.0 * count(CASE WHEN s.purchased THEN 1 END)
             / nullif(count(CASE WHEN s.reached_checkout THEN 1 END), 0), 2) AS checkout_to_purchase_pct,
       count(CASE WHEN s.reached_checkout THEN 1 END) AS reached_checkout
FROM dash_demo.web_sessions s
WHERE true
  AND s.started_ts >= \${dateFrom}
  AND s.started_ts < \${dateTo__next_day}
  AND s.device IN (\${device})
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for mobile checkout per month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show mobile checkout per month as chart',
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
            labelField: 'month',
            datasets: [{ field: 'checkout_to_purchase_pct', label: 'Checkout to purchase %' }],
          },
          options: {
            plugins: {
              title: {
                display: true,
                text: 'Checkout to purchase % per month - filter to mobile for the June story',
              },
            },
            legend: { display: false },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'checkout_to_purchase_pct'
        label 'Checkout to purchase %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Checkout to purchase % per month - filter to mobile for the June story'
      }
    }
    legend {
      display false
    }
  }
}
`,
      shot: {
        title: 'Set up mobile checkout per month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-pivot-sessions-weekday-hour',
      table: 'dash_demo.web_sessions',
      grid: { x: 6, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on web_sessions',
        caption: 'In the schema browser, pick **web_sessions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT CAST(isodow(s.started_ts) AS VARCHAR) || ' ' || strftime(s.started_ts, '%a') AS weekday,
       lpad(CAST(hour(s.started_ts) AS VARCHAR), 2, '0') AS hour_of_day,
       count(*) AS sessions
FROM dash_demo.web_sessions s
WHERE true
  AND s.started_ts >= \${dateFrom}
  AND s.started_ts < \${dateTo__next_day}
  AND s.device IN (\${device})
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for sessions weekday hour',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: {
        title: 'Show sessions weekday hour as pivot',
        caption: 'Under **Visualize as**, choose **pivot**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'pivot',
      config: {},
      dsl: `pivotTable {
  rows([
    'weekday'
  ])
  cols([
    'hour_of_day'
  ])
  vals([
    'sessions'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals true
  colTotals false
}
`,
      shot: {
        title: 'Set up sessions weekday hour',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd12-chart-conversion-by-traffic-source',
      table: 'dash_demo.web_sessions',
      grid: { x: 0, y: 13, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on web_sessions',
        caption: 'In the schema browser, pick **web_sessions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT s.traffic_source AS traffic_source,
       round(100.0 * count(CASE WHEN s.purchased THEN 1 END) / count(*), 2) AS conversion_pct,
       count(CASE WHEN s.purchased THEN 1 END) AS purchasing_sessions
FROM dash_demo.web_sessions s
WHERE true
  AND s.started_ts >= \${dateFrom}
  AND s.started_ts < \${dateTo__next_day}
  AND s.device IN (\${device})
GROUP BY 1
ORDER BY conversion_pct DESC`,
      shot: {
        title: 'The query for conversion by traffic source',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show conversion by traffic source as chart',
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
            labelField: 'traffic_source',
            datasets: [{ field: 'conversion_pct', label: 'Conversion %' }],
          },
          options: {
            plugins: {
              title: { display: true, text: 'Conversion rate by traffic source' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'traffic_source'
    datasets {
      dataset {
        field 'conversion_pct'
        label 'Conversion %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Conversion rate by traffic source'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up conversion by traffic source',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 3 },
        { x: 4, y: 1, w: 3, h: 3 },
        { x: 7, y: 1, w: 5, h: 3 },
        { x: 0, y: 4, w: 6, h: 5 },
        { x: 6, y: 4, w: 6, h: 5 },
        { x: 0, y: 9, w: 6, h: 4 },
        { x: 6, y: 9, w: 6, h: 4 },
        { x: 0, y: 13, w: 12, h: 4 },
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

// Dashboard Demo 06, Seasonality & Peak Times: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-seasonality, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-seasonality',
  nn: 6,
  title: 'Seasonality & Peak Times',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All channels --\\' AS label UNION ALL SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Channel).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd06-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Seasonality & Peak Times

Orders peak on Monday evenings, 19:00-21:00, with Monday 20:00 the busiest hour of the week, while sales-rep orders peak on Monday at 13:00. November is about 2.3 times an average month and the Black Friday days run about 4 times an average day; the 25th to the 27th of any month bring about 25% more orders than an average day, and August runs a third below an average month.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd06-pivot-weekday-hour',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT dayname(o.order_ts) AS weekday,
       lpad(hour(o.order_ts)::VARCHAR, 2, '0') AS hour_of_day,
       count(*) AS orders
FROM dash_demo.orders o
WHERE o.channel = \${channel}
GROUP BY 1, 2`,
      shot: {
        title: 'The query for weekday hour',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: { title: 'Show weekday hour as pivot', caption: 'Under **Visualize as**, choose **pivot**.' },
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
    'orders'
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
        title: 'Set up weekday hour',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd06-chart-orders-by-month-of-year',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 6, w: 6, h: 4 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [{ column: 'channel', operator: 'equals', value: '${channel}' }],
        summarize: [{ aggregation: 'COUNT', field: 'order_id' }],
        groupBy: ['order_ts'],
        buckets: { order_ts: 'month-of-year' },
        sort: [{ column: 'order_ts', direction: 'ASC' }],
        limit: 12,
      },
      shot: {
        title: 'Build the query for orders by month of year',
        caption: 'Fill the Visual tab: **Summarize → Count of order_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show orders by month of year as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'order_ts', datasets: [{ field: 'order_id_count', label: 'Orders' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Orders by month of year' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'order_ts'
    datasets {
      dataset {
        field 'order_id_count'
        label 'Orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Orders by month of year'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up orders by month of year',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd06-chart-average-by-day-of-month',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 6, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH per_day AS (
  SELECT date_trunc('month', o.order_ts) AS month,
         day(o.order_ts) AS day_of_month,
         count(*) AS n
  FROM dash_demo.orders o
  WHERE o.channel = \${channel}
  GROUP BY 1, 2
), month_average AS (
  SELECT month, avg(n) AS avg_n FROM per_day GROUP BY 1
)
SELECT p.day_of_month AS day_of_month,
       round(avg(p.n), 2) AS avg_orders,
       round(100.0 * avg(p.n / m.avg_n), 4) AS pct_of_daily_average
FROM per_day p
JOIN month_average m USING (month)
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for average by day of month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show average by day of month as chart',
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
            labelField: 'day_of_month',
            datasets: [{ field: 'avg_orders', label: 'Average orders' }],
          },
          options: {
            plugins: {
              title: { display: true, text: 'Average orders per day, by day of month' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'day_of_month'
    datasets {
      dataset {
        field 'avg_orders'
        label 'Average orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Average orders per day, by day of month'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up average by day of month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd06-chart-daily-orders-black-friday',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 10, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.order_ts::DATE AS day,
       count(*) AS orders
FROM dash_demo.orders o
WHERE o.order_ts >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 2 MONTH
  AND o.order_ts < date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 16 DAY
  AND o.channel = \${channel}
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for daily orders black friday',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show daily orders black friday as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: { labelField: 'day', datasets: [{ field: 'orders', label: 'Orders' }] },
          options: {
            plugins: {
              title: {
                display: true,
                text: 'Daily orders around last year\'s Black Friday, 1 November - 15 December',
              },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'day'
    datasets {
      dataset {
        field 'orders'
        label 'Orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Daily orders around last year\\'s Black Friday, 1 November - 15 December'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up daily orders black friday',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 12, h: 5 },
        { x: 0, y: 6, w: 6, h: 4 },
        { x: 6, y: 6, w: 6, h: 4 },
        { x: 0, y: 10, w: 12, h: 4 },
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

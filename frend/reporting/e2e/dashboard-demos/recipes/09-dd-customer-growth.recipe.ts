// Dashboard Demo 09, Customer Base & Growth: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-customer-growth, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-customer-growth',
  nn: 9,
  title: 'Customer Base & Growth',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'segment', type: 'String', label: 'Segment') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \\'\\' AS value, \\'-- All segments --\\' AS label UNION ALL SELECT DISTINCT segment AS value, segment AS label FROM dash_demo.customers ORDER BY label')
  }
  parameter(id: 'acquisitionChannel', type: 'String', label: 'Acquisition channel', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT acquisition_channel AS value, acquisition_channel AS label FROM dash_demo.customers ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Segment, Acquisition channel).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd09-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Customer Base & Growth

Referral signups more than doubled after the loyalty programme of March 2025, from about 13 a month to about 29.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-kpi-customers',
      table: 'dash_demo.customers',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: { title: 'Pick the customers table', caption: 'In the schema browser, pick **customers**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'segment', operator: 'equals', value: '${segment}' },
          { column: 'acquisition_channel', operator: 'in', value: '${acquisitionChannel}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'customer_id' }],
      },
      shot: {
        title: 'Build the query for customers',
        caption: 'Fill the Visual tab: **Summarize → Count of customer_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show customers as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'customer_id_count', numberLabel: 'Customers', numberFormat: 'number' },
      shot: {
        title: 'Set up customers',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-kpi-new-in-30-days',
      table: 'dash_demo.customers',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on customers',
        caption: 'In the schema browser, pick **customers**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS new_customers
FROM dash_demo.customers c
WHERE true
  AND c.segment = \${segment}
  AND c.acquisition_channel IN (\${acquisitionChannel})
  AND c.signup_date > (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 30 DAY
  AND c.signup_date <= (SELECT a.as_of FROM dash_demo.as_of a)`,
      shot: {
        title: 'The query for new in 30 days',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show new in 30 days as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'new_customers',
        numberLabel: 'New in the last 30 days',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up new in 30 days',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-trend-new-customers-per-month',
      table: 'dash_demo.customers',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: { title: 'Pick the customers table', caption: 'In the schema browser, pick **customers**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'segment', operator: 'equals', value: '${segment}' },
          { column: 'acquisition_channel', operator: 'in', value: '${acquisitionChannel}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'customer_id' }],
        groupBy: ['signup_date'],
        buckets: { signup_date: 'month' },
        sort: [{ column: 'signup_date', direction: 'ASC' }],
      },
      shot: {
        title: 'Build the query for new customers per month',
        caption: 'Fill the Visual tab: **Summarize → Count of customer_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: {
        title: 'Show new customers per month as trend',
        caption: 'Under **Visualize as**, choose **trend**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: {
        dateField: 'signup_date',
        valueField: 'customer_id_count',
        format: 'number',
        label: 'New customers per month',
      },
      shot: {
        title: 'Set up new customers per month',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-kpi-repeat-buyers',
      table: 'dash_demo.orders',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(1.0 * count(CASE WHEN b.orders > 1 THEN 1 END) / count(*), 4) AS repeat_buyer_pct
FROM (SELECT (SELECT count(*) FROM dash_demo.orders o
              WHERE o.customer_id = c.customer_id
                AND o.status <> 'cancelled') AS orders
      FROM dash_demo.customers c
      WHERE true
        AND c.segment = \${segment}
        AND c.acquisition_channel IN (\${acquisitionChannel})
     ) b`,
      shot: {
        title: 'The query for repeat buyers',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show repeat buyers as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'repeat_buyer_pct', numberLabel: 'Repeat buyers', numberFormat: 'percent' },
      shot: {
        title: 'Set up repeat buyers',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-chart-new-customers-per-month-by-channel',
      table: 'dash_demo.customers',
      grid: { x: 0, y: 4, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on customers',
        caption: 'In the schema browser, pick **customers**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(date_trunc('month', c.signup_date), '%Y-%m') AS month,
       CASE WHEN c.acquisition_channel IN ('partner', 'email') THEN 'Other'
            ELSE c.acquisition_channel END AS channel,
       count(*) AS new_customers
FROM dash_demo.customers c
WHERE true
  AND c.segment = \${segment}
  AND c.acquisition_channel IN (\${acquisitionChannel})
  AND c.signup_date >= DATE '2024-01-01'
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for new customers per month by channel',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show new customers per month by channel as chart',
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
            seriesField: 'channel',
            datasets: [{ field: 'new_customers', label: 'New customers' }],
          },
          options: { plugins: { title: { display: true, text: 'New customers per month by channel' } } },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month'
    seriesField 'channel'
    datasets {
      dataset {
        field 'new_customers'
        label 'New customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'New customers per month by channel'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up new customers per month by channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-chart-segment-mix',
      table: 'dash_demo.customers',
      grid: { x: 8, y: 4, w: 4, h: 4 },
      shot: { title: 'Pick the customers table', caption: 'In the schema browser, pick **customers**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'segment', operator: 'equals', value: '${segment}' },
          { column: 'acquisition_channel', operator: 'in', value: '${acquisitionChannel}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'customer_id' }],
        groupBy: ['segment'],
        sort: [{ column: 'customer_id_count', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for segment mix',
        caption: 'Fill the Visual tab: **Summarize → Count of customer_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show segment mix as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'doughnut',
          data: { labelField: 'segment', datasets: [{ field: 'customer_id_count', label: 'Customers' }] },
          options: { plugins: { title: { display: true, text: 'Segment mix' } } },
        },
      },
      dsl: `chart {
  type 'doughnut'
  data {
    labelField 'segment'
    datasets {
      dataset {
        field 'customer_id_count'
        label 'Customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Segment mix'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up segment mix',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-map-customers-by-country',
      table: 'dash_demo.customers',
      grid: { x: 0, y: 8, w: 6, h: 5 },
      shot: { title: 'Pick the customers table', caption: 'In the schema browser, pick **customers**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'segment', operator: 'equals', value: '${segment}' },
          { column: 'acquisition_channel', operator: 'in', value: '${acquisitionChannel}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'customer_id' }],
        groupBy: ['country_code'],
        sort: [{ column: 'customer_id_count', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for customers by country',
        caption: 'Fill the Visual tab: **Summarize → Count of customer_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'map',
      shot: {
        title: 'Show customers by country as map',
        caption: 'Under **Visualize as**, choose **map**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'map',
      config: {
        mapType: 'region',
        region: 'world_countries',
        dimension: 'country_code',
        metric: 'customer_id_count',
      },
      shot: {
        title: 'Set up customers by country',
        caption: 'On the **Display** tab, set the map\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-chart-customers-by-lifetime-orders',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 8, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT b.bucket AS lifetime_orders,
       count(*) AS customers
FROM (SELECT CASE WHEN n.orders = 0 THEN 'none'
                  WHEN n.orders = 1 THEN '1'
                  WHEN n.orders <= 3 THEN '2-3'
                  WHEN n.orders <= 5 THEN '4-5'
                  WHEN n.orders <= 9 THEN '6-9'
                  ELSE '10 or more' END AS bucket,
             CASE WHEN n.orders = 0 THEN 0
                  WHEN n.orders = 1 THEN 1
                  WHEN n.orders <= 3 THEN 2
                  WHEN n.orders <= 5 THEN 3
                  WHEN n.orders <= 9 THEN 4
                  ELSE 5 END AS sort_key
      FROM (SELECT (SELECT count(*) FROM dash_demo.orders o
                    WHERE o.customer_id = c.customer_id
                      AND o.status <> 'cancelled') AS orders
            FROM dash_demo.customers c
            WHERE true
              AND c.segment = \${segment}
              AND c.acquisition_channel IN (\${acquisitionChannel})
           ) n
     ) b
GROUP BY 1, b.sort_key
ORDER BY b.sort_key`,
      shot: {
        title: 'The query for customers by lifetime orders',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show customers by lifetime orders as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'lifetime_orders', datasets: [{ field: 'customers', label: 'Customers' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Customers by lifetime orders' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'lifetime_orders'
    datasets {
      dataset {
        field 'customers'
        label 'Customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Customers by lifetime orders'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up customers by lifetime orders',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd09-table-newest-customers',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 13, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT c.name AS customer,
       c.segment AS segment,
       c.acquisition_channel AS acquisition_channel,
       g.country AS country,
       c.signup_date AS signup_date,
       (SELECT round(o.total_amount, 2) FROM dash_demo.orders o
        WHERE o.customer_id = c.customer_id
          AND o.status <> 'cancelled'
        ORDER BY o.order_ts
        LIMIT 1) AS first_order_value
FROM dash_demo.customers c
JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
WHERE true
  AND c.segment = \${segment}
  AND c.acquisition_channel IN (\${acquisitionChannel})
ORDER BY c.signup_date DESC
LIMIT 200`,
      shot: {
        title: 'The query for newest customers',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show newest customers as tabulator',
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
          paginationSize: 10,
          theme: 'modern',
        },
      },
      shot: {
        title: 'Set up newest customers',
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
        { x: 0, y: 4, w: 8, h: 4 },
        { x: 8, y: 4, w: 4, h: 4 },
        { x: 0, y: 8, w: 6, h: 5 },
        { x: 6, y: 8, w: 6, h: 5 },
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

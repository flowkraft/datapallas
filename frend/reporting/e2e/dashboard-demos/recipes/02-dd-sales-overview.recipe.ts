// Dashboard Demo 02, Sales Overview: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-sales-overview, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-sales-overview',
  nn: 2,
  title: 'Sales Overview',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 1 year, startOf year}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'country', type: 'String', label: 'Country') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All countries --\\' AS label UNION ALL SELECT DISTINCT country_code AS value, country AS label FROM dash_demo.geo_cities ORDER BY label')
  }
  parameter(id: 'channel', type: 'String', label: 'Channel', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (From, To, Country, Channel).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd02-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Sales Overview

Every month this year except August runs above the same month a year earlier, most of them by about a quarter; Smart Home, the newest category, has already all but caught Office Furniture for third place.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-kpi-revenue',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 3, h: 2 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'SUM', field: 'total_amount' }],
        limit: 1,
      },
      shot: {
        title: 'Build the query for revenue',
        caption: 'Fill the Visual tab: **Summarize → Sum of total_amount**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show revenue as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'total_amount_sum', numberFormat: 'currency', numberLabel: 'Revenue' },
      shot: {
        title: 'Set up revenue',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-kpi-orders',
      table: 'dash_demo.orders',
      grid: { x: 3, y: 1, w: 3, h: 2 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'COUNT', field: 'order_id' }],
        limit: 1,
      },
      shot: {
        title: 'Build the query for orders',
        caption: 'Fill the Visual tab: **Summarize → Count of order_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show orders as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'order_id_count', numberFormat: 'number', numberLabel: 'Orders' },
      shot: {
        title: 'Set up orders',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-kpi-average-order-value',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 1, w: 3, h: 2 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'AVG', field: 'total_amount' }],
        limit: 1,
      },
      shot: {
        title: 'Build the query for average order value',
        caption: 'Fill the Visual tab: **Summarize → Avg of total_amount**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show average order value as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'total_amount_avg',
        numberFormat: 'currency',
        numberLabel: 'Average order value',
        numberDecimals: 2,
      },
      shot: {
        title: 'Set up average order value',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-kpi-customers-who-ordered',
      table: 'dash_demo.orders',
      grid: { x: 9, y: 1, w: 3, h: 2 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'COUNT DISTINCT', field: 'customer_id' }],
        limit: 1,
      },
      shot: {
        title: 'Build the query for customers who ordered',
        caption: 'Fill the Visual tab: **Summarize → Count Distinct of customer_id**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show customers who ordered as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'customer_id_count distinct', numberFormat: 'number', numberLabel: 'Customers who ordered' },
      shot: {
        title: 'Set up customers who ordered',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-chart-revenue-per-month',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 3, w: 12, h: 4 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'SUM', field: 'total_amount' }],
        groupBy: ['order_ts'],
        buckets: { order_ts: 'month' },
        sort: [{ column: 'order_ts', direction: 'ASC' }],
      },
      shot: {
        title: 'Build the query for revenue per month',
        caption: 'Fill the Visual tab: **Summarize → Sum of total_amount**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue per month as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: { labelField: 'order_ts', datasets: [{ field: 'total_amount_sum', label: 'Revenue' }] },
          options: { plugins: { title: { display: true, text: 'Revenue per month' } } },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'order_ts'
    datasets {
      dataset {
        field 'total_amount_sum'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue per month'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up revenue per month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-chart-revenue-by-category',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.category AS category,
       ROUND(SUM(l.line_amount), 2) AS revenue
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND o.order_ts >= \${dateFrom}
  AND o.order_ts < \${dateTo__next_day}
  AND o.country_code = \${country}
  AND o.channel IN (\${channel})
GROUP BY p.category
ORDER BY revenue DESC`,
      shot: {
        title: 'The query for revenue by category',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue by category as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'category', datasets: [{ field: 'revenue', label: 'Revenue' }] },
          options: { plugins: { title: { display: true, text: 'Revenue by category' } } },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue by category'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up revenue by category',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-chart-revenue-by-channel',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 7, w: 6, h: 4 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'SUM', field: 'total_amount' }],
        groupBy: ['channel'],
        sort: [{ column: 'total_amount_sum', direction: 'DESC' }],
        limit: 50,
      },
      shot: {
        title: 'Build the query for revenue by channel',
        caption: 'Fill the Visual tab: **Summarize → Sum of total_amount**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue by channel as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'channel', datasets: [{ field: 'total_amount_sum', label: 'Revenue' }] },
          options: { plugins: { title: { display: true, text: 'Revenue by channel' } } },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'total_amount_sum'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue by channel'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up revenue by channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-map-revenue-by-country',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 11, w: 6, h: 5 },
      shot: { title: 'Pick the orders table', caption: 'In the schema browser, pick **orders**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          { column: 'order_ts', operator: 'between', value: '${dateFrom}', valueTo: '${dateTo}' },
          { column: 'country_code', operator: 'equals', value: '${country}' },
          { column: 'channel', operator: 'in', value: '${channel}' },
        ],
        summarize: [{ aggregation: 'SUM', field: 'total_amount' }],
        groupBy: ['country_code'],
        sort: [{ column: 'total_amount_sum', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for revenue by country',
        caption: 'Fill the Visual tab: **Summarize → Sum of total_amount**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'map',
      shot: {
        title: 'Show revenue by country as map',
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
        metric: 'total_amount_sum',
      },
      shot: {
        title: 'Set up revenue by country',
        caption: 'On the **Display** tab, set the map\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd02-table-top-products',
      table: 'dash_demo.order_lines',
      grid: { x: 6, y: 11, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.name AS product,
       p.category AS category,
       SUM(l.qty) AS quantity,
       ROUND(SUM(l.line_amount), 2) AS revenue
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND o.order_ts >= \${dateFrom}
  AND o.order_ts < \${dateTo__next_day}
  AND o.country_code = \${country}
  AND o.channel IN (\${channel})
GROUP BY p.name, p.category
ORDER BY revenue DESC
LIMIT 20`,
      shot: {
        title: 'The query for top products',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show top products as tabulator',
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
        title: 'Set up top products',
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
        { x: 0, y: 3, w: 12, h: 4 },
        { x: 0, y: 7, w: 6, h: 4 },
        { x: 6, y: 7, w: 6, h: 4 },
        { x: 0, y: 11, w: 6, h: 5 },
        { x: 6, y: 11, w: 6, h: 5 },
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

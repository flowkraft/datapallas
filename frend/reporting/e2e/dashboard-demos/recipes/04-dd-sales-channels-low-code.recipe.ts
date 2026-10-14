// Dashboard Demo 04, Sales Channels (low-code): the same dashboard as 04-dd-sales-channels.recipe.ts,
// built with less code (plan-dashboard-demos-low-code.md, TODO 7 and 8). Against the original: the
// filter through the form; revenue mix and average order value per channel on the Visual tab (the
// returned orders switched by includeReturns, the share as % of total), not SQL; charts by the
// pickers.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-sales-channels-low-code',
  nn: 4,
  title: 'Sales Channels (low-code)',
  steps: [
    {
      kind: 'filters',
      via: 'form',
      params: [
        {
          id: 'includeReturns',
          type: 'Boolean',
          label: 'Include returns',
          defaultValue: false,
          constraints: { required: false },
          uiHints: { control: 'checkbox' },
        },
      ],
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters** and add each filter in the form (Include returns): its label, id, type, control, default and options.',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd04-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Sales Channels

The mobile app has grown from about 14% to about 28% of orders since 2024 while the marketplace has shrunk from 19% to 12%. Marketplace orders come back about twice as often as web orders (10.7% against 5.6%), and Smart Home sells mostly through the app.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd04-chart-revenue-mix-by-channel',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 6, h: 4 },
      shot: {
        title: 'Pick the orders table',
        caption: 'In the schema browser, pick **orders**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          {
            column: 'status',
            operator: 'not_equals',
            value: 'returned',
            switchParam: 'includeReturns',
            switchOn: 'off',
          },
        ],
        summarize: [
          { aggregation: 'SUM', field: 'total_amount' },
          { aggregation: 'SUM', field: 'total_amount', share: true },
        ],
        groupBy: ['channel'],
        sort: [{ column: 'total_amount_sum', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for revenue mix by channel',
        caption: 'Fill the Visual tab: status is not cancelled; status is not returned, only while **Include returns** is off; **Sum of total_amount** and the same as **% of total**, by channel, largest first.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue mix by channel as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'pie',
          data: {
            labelField: 'channel',
            datasets: [{ field: 'total_amount_sum', label: 'Revenue' }],
          },
          options: { plugins: { title: { display: true, text: 'Revenue mix by channel' } } },
        },
      },
      shot: {
        title: 'Set up revenue mix by channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd04-chart-average-order-value-per-channel',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 1, w: 6, h: 4 },
      shot: {
        title: 'Pick the orders table',
        caption: 'In the schema browser, pick **orders**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'status', operator: 'not_equals', value: 'cancelled' },
          {
            column: 'status',
            operator: 'not_equals',
            value: 'returned',
            switchParam: 'includeReturns',
            switchOn: 'off',
          },
        ],
        summarize: [
          { aggregation: 'AVG', field: 'total_amount' },
          { aggregation: 'COUNT', field: 'order_id' },
        ],
        groupBy: ['channel'],
        sort: [{ column: 'total_amount_avg', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for average order value per channel',
        caption: 'Fill the Visual tab: the same two filters; **Average of total_amount** and **Count of order_id**, by channel, highest average first.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show average order value per channel as chart',
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
            labelField: 'channel',
            datasets: [{ field: 'total_amount_avg', label: 'Average order' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Average order value per channel' } },
          },
        },
      },
      shot: {
        title: 'Set up average order value per channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd04-chart-channel-share-per-month',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 5, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT date_trunc('month', o.order_ts) AS month,
       o.channel AS channel,
       round(100.0 * count(*)
             / sum(count(*)) OVER (PARTITION BY date_trunc('month', o.order_ts)), 2) AS share_pct
FROM dash_demo.orders o
WHERE o.status <> 'cancelled'
  AND (o.status <> 'returned' OR \${includeReturns})
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for channel share per month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show channel share per month as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'area',
          data: {
            labelField: 'month',
            seriesField: 'channel',
            datasets: [{ field: 'share_pct', label: 'Share of orders %' }],
          },
          options: { plugins: { title: { display: true, text: 'Channel share of orders per month' } } },
        },
      },
      shot: {
        title: 'Set up channel share per month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd04-sankey-channel-to-category',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 9, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.channel AS channel,
       p.category AS category,
       round(sum(l.line_amount), 2) AS revenue
FROM dash_demo.orders o
JOIN dash_demo.order_lines l ON l.order_id = o.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND (o.status <> 'returned' OR \${includeReturns})
GROUP BY 1, 2
ORDER BY revenue DESC`,
      shot: {
        title: 'The query for channel to category',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'sankey',
      shot: {
        title: 'Show channel to category as sankey',
        caption: 'Under **Visualize as**, choose **sankey**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'sankey',
      config: {
        widgetTitle: 'Revenue from channel to category',
        sourceField: 'channel',
        targetField: 'category',
        valueField: 'revenue',
        label: 'Channel → category revenue',
      },
      shot: {
        title: 'Set up channel to category',
        caption: 'On the **Display** tab, set the sankey\'s fields, label and format.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 6, h: 4 },
        { x: 6, y: 1, w: 6, h: 4 },
        { x: 0, y: 5, w: 12, h: 4 },
        { x: 0, y: 9, w: 12, h: 5 },
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

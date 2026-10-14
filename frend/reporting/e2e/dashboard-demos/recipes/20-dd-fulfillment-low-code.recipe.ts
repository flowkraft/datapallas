// Dashboard Demo 20, Fulfillment & Delivery (low-code): the same dashboard as
// 20-dd-fulfillment.recipe.ts, built with less code (plan-dashboard-demos-low-code.md, TODO 7 and 8).
// Against the original: the filters through the form; the on-time gauge, the late orders and the
// on-time trend per week from the dd-delivery cube, bound to the filters, not SQL; charts by the
// pickers.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-fulfillment-low-code',
  nn: 20,
  title: 'Fulfillment & Delivery (low-code)',
  steps: [
    {
      kind: 'filters',
      via: 'form',
      params: [
        {
          id: 'dateFrom',
          type: 'Date',
          label: 'From',
          defaultValue: '{dataToday:minus 90 days}',
          constraints: { required: true },
          uiHints: { control: 'datepicker' },
        },
        {
          id: 'dateTo',
          type: 'Date',
          label: 'To',
          defaultValue: '{dataToday}',
          constraints: { required: true },
          uiHints: { control: 'datepicker' },
        },
        {
          id: 'carrier',
          type: 'String',
          label: 'Carrier',
          defaultValue: [],
          constraints: { required: false },
          uiHints: {
            control: 'multiselect',
            options: 'SELECT DISTINCT o.carrier AS value, o.carrier AS label FROM dash_demo.orders o WHERE o.carrier IS NOT NULL ORDER BY label',
          },
        },
      ],
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters** and add each filter in the form (From, To, Carrier): its label, id, type, control, default and options.',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd20-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Fulfillment & Delivery

Lateness is a carrier, not a country: SwiftPost is late 12.3% of the time against 4.28% for the other two over every delivery on the books - 12.38% against 4.25% and 3.05% in the last 90 days - and it is the worse carrier in all 18 countries where it delivers at least 60 parcels a year, from 7.56% in the Netherlands to 20% in Sweden. When it is late the parcel arrives 3.51 days late, against about a day and a half for the others, which is why its delivery-days box has the long tail.

Are we on time and which way it is going, then whether it is one carrier and how late its parcels are, then the map and the list: the map is flat when lateness is not a country problem, and the list is what to chase. **A country with fewer than 60 deliveries in the window has no rate and stays uncoloured** - one late parcel in three is not a fact. The window defaults to the last 90 days, the carrier review period.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickCube',
      key: 'w-dd20-gauge-on-time-delivery',
      cubeId: 'dd-delivery',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Pick the dd-delivery cube',
        caption: 'In the schema browser, pick the cube **dd-delivery**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['OnTimePct'],
        filters: [{ member: 'DeliveredAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        bindings: [
          { param: 'dateFrom', member: 'DeliveredAt', operator: 'greater_or_equal' },
          { param: 'carrier', member: 'Carrier', operator: 'in' },
        ],
      },
      shot: { title: 'Tick the fields of on-time delivery', caption: 'Tick **OnTimePct**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show on time delivery as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'OnTimePct',
        min: 0.8,
        max: 1,
        label: 'On-time delivery',
        gaugeFormat: 'percent',
        gaugeBands: [
          { to: 0.9, color: '#ef8c8c' },
          { to: 0.95, color: '#f9d45c' },
          { to: 1, color: '#88bf4d' },
        ],
      },
      shot: {
        title: 'Set up on time delivery',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd20-kpi-average-days-to-deliver',
      table: 'dash_demo.orders',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(avg(date_diff('day', o.order_ts::DATE, o.delivered_ts::DATE)), 2) AS average_days_to_deliver
FROM dash_demo.orders o
WHERE o.delivered_ts IS NOT NULL
  AND o.delivered_ts >= \${dateFrom}
  AND o.delivered_ts < \${dateTo__next_day}
  AND o.carrier IN (\${carrier})`,
      shot: {
        title: 'The query for average days to deliver',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show average days to deliver as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'average_days_to_deliver',
        numberLabel: 'Average days to deliver',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up average days to deliver',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd20-kpi-late-orders',
      cubeId: 'dd-delivery',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Pick the dd-delivery cube',
        caption: 'In the schema browser, pick the cube **dd-delivery**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['Late'],
        filters: [{ member: 'DeliveredAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        bindings: [
          { param: 'dateFrom', member: 'DeliveredAt', operator: 'greater_or_equal' },
          { param: 'carrier', member: 'Carrier', operator: 'in' },
        ],
      },
      shot: { title: 'Tick the fields of late orders', caption: 'Tick **Late**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show late orders as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'Late', numberLabel: 'Late orders', numberFormat: 'number' },
      shot: {
        title: 'Set up late orders',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd20-trend-on-time-per-week',
      cubeId: 'dd-delivery',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Pick the dd-delivery cube',
        caption: 'In the schema browser, pick the cube **dd-delivery**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: ['DeliveredAt'],
        measures: ['OnTimePct'],
        granularities: { DeliveredAt: 'week' },
        filters: [{ member: 'DeliveredAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        order: [{ member: 'DeliveredAt', dir: 'asc' }],
        bindings: [
          { param: 'dateFrom', member: 'DeliveredAt', operator: 'greater_or_equal' },
          { param: 'carrier', member: 'Carrier', operator: 'in' },
        ],
      },
      shot: {
        title: 'Tick the fields of on-time per week',
        caption: 'Tick **DeliveredAt, OnTimePct**.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: {
        title: 'Show on time per week as trend',
        caption: 'Under **Visualize as**, choose **trend**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: {
        dateField: 'DeliveredAt',
        valueField: 'OnTimePct',
        format: 'percent',
        label: 'On-time % per week',
      },
      shot: {
        title: 'Set up on time per week',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd20-chart-late-by-carrier',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.carrier AS carrier,
       round(100.0 * count(CASE WHEN o.delivered_ts::DATE > o.promised_date THEN 1 END) / count(*), 2) AS late_pct
FROM dash_demo.orders o
WHERE o.delivered_ts IS NOT NULL
  AND o.delivered_ts >= \${dateFrom}
  AND o.delivered_ts < \${dateTo__next_day}
  AND o.carrier IN (\${carrier})
GROUP BY o.carrier
ORDER BY late_pct DESC`,
      shot: {
        title: 'The query for late by carrier',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show late by carrier as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'carrier', datasets: [{ field: 'late_pct', label: 'Late %' }] },
          options: {
            plugins: { title: { display: true, text: 'Late % by carrier' }, legend: { display: false } },
          },
        },
      },
      shot: {
        title: 'Set up late by carrier',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd20-chart-boxplot-delivery-days-by-carrier',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.carrier AS carrier,
       date_diff('day', o.order_ts::DATE, o.delivered_ts::DATE) AS delivery_days
FROM dash_demo.orders o
WHERE o.delivered_ts IS NOT NULL
  AND o.delivered_ts >= \${dateFrom}
  AND o.delivered_ts < \${dateTo__next_day}
  AND o.carrier IN (\${carrier})
ORDER BY o.carrier, delivery_days`,
      shot: {
        title: 'The query for boxplot delivery days by carrier',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show boxplot delivery days by carrier as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'boxplot',
          data: {
            labelField: 'carrier',
            datasets: [{ field: 'delivery_days', label: 'Days to deliver' }],
          },
          options: { plugins: { title: { display: true, text: 'Delivery days by carrier' } } },
        },
      },
      shot: {
        title: 'Set up boxplot delivery days by carrier',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd20-map-late-by-country',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 8, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT g.country AS country,
       CASE WHEN count(*) >= 60
            THEN round(100.0 * count(CASE WHEN o.delivered_ts::DATE > o.promised_date THEN 1 END) / count(*), 2)
       END AS late_pct
FROM dash_demo.orders o
JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
WHERE o.delivered_ts IS NOT NULL
  AND o.delivered_ts >= \${dateFrom}
  AND o.delivered_ts < \${dateTo__next_day}
  AND o.carrier IN (\${carrier})
GROUP BY g.country
ORDER BY g.country`,
      shot: {
        title: 'The query for late by country',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'map',
      shot: { title: 'Show late by country as map', caption: 'Under **Visualize as**, choose **map**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'map',
      config: { widgetTitle: 'Late deliveries by country, %', mapType: 'region', region: 'world_countries', dimension: 'country', metric: 'late_pct' },
      shot: {
        title: 'Set up late by country',
        caption: 'On the **Display** tab, set the map\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd20-table-late-orders',
      table: 'dash_demo.orders',
      grid: { x: 6, y: 8, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.order_id AS order_id,
       o.carrier AS carrier,
       g.country AS country,
       o.promised_date AS promised_date,
       o.delivered_ts::DATE AS delivered_date,
       date_diff('day', o.promised_date, o.delivered_ts::DATE) AS days_late
FROM dash_demo.orders o
JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
WHERE o.delivered_ts IS NOT NULL
  AND o.delivered_ts >= \${dateFrom}
  AND o.delivered_ts < \${dateTo__next_day}
  AND o.carrier IN (\${carrier})
  AND o.delivered_ts::DATE > o.promised_date
ORDER BY days_late DESC, o.delivered_ts DESC`,
      shot: {
        title: 'The query for late orders',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show late orders as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: {
        widgetTitle: 'Late orders',
        dslConfig: {
          layout: 'fitColumns',
          autoColumns: true,
          pagination: true,
          paginationSize: 10,
          theme: 'modern',
        },
        columnSettings: {
          order_id: { columnTitle: 'Order' },
          promised_date: { columnTitle: 'Promised' },
          delivered_date: { columnTitle: 'Delivered' },
          days_late: { columnTitle: 'Days late' },
        },
      },
      shot: {
        title: 'Set up late orders',
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
        { x: 0, y: 8, w: 6, h: 4 },
        { x: 6, y: 8, w: 6, h: 4 },
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

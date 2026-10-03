// Dashboard Demo 03, Sales by Country: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-sales-by-country, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-sales-by-country',
  nn: 3,
  title: 'Sales by Country',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'region', type: 'String', label: 'Region') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \\'\\' AS value, \\'-- All regions --\\' AS label UNION ALL SELECT DISTINCT region AS value, region AS label FROM dash_demo.geo_cities ORDER BY label')
  }
  parameter(id: 'countries', type: 'String', label: 'Countries', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT country AS value, country AS label FROM dash_demo.geo_cities ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Region, Countries).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd03-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Sales by Country

Germany is the largest market, Canada grows fastest (about +49%), and Japan has the largest orders.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd03-map-revenue-by-country',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 8, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT g.country AS country,
       round(sum(o.total_amount), 2) AS revenue
FROM dash_demo.orders o
JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
WHERE o.status <> 'cancelled'
  AND g.region = \${region}
  AND g.country IN (\${countries})
GROUP BY 1
ORDER BY revenue DESC`,
      shot: {
        title: 'The query for revenue by country',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
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
      config: { mapType: 'region', region: 'world_countries', dimension: 'country', metric: 'revenue' },
      shot: {
        title: 'Set up revenue by country',
        caption: 'On the **Display** tab, set the map\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd03-chart-average-order-value-by-country',
      table: 'dash_demo.orders',
      grid: { x: 8, y: 1, w: 4, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT g.country AS country,
       round(avg(o.total_amount), 2) AS average_order_value
FROM dash_demo.orders o
JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
WHERE o.status <> 'cancelled'
  AND g.region = \${region}
  AND g.country IN (\${countries})
GROUP BY 1
ORDER BY average_order_value DESC
LIMIT 10`,
      shot: {
        title: 'The query for average order value by country',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show average order value by country as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: {
            labelField: 'country',
            datasets: [{ field: 'average_order_value', label: 'Average order' }],
          },
          options: { plugins: { title: { display: true, text: 'Average order value by country, top 10' } } },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'country'
    datasets {
      dataset {
        field 'average_order_value'
        label 'Average order'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Average order value by country, top 10'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up average order value by country',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd03-map-orders-by-city',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 6, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT g.city AS city,
       g.country AS country,
       g.latitude AS latitude,
       g.longitude AS longitude,
       count(*) AS orders
FROM dash_demo.orders o
JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
WHERE o.status <> 'cancelled'
  AND g.region = \${region}
  AND g.country IN (\${countries})
GROUP BY 1, 2, 3, 4
ORDER BY orders DESC`,
      shot: {
        title: 'The query for orders by city',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'map',
      shot: { title: 'Show orders by city as map', caption: 'Under **Visualize as**, choose **map**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'map',
      config: {
        mapType: 'pin',
        latField: 'latitude',
        lonField: 'longitude',
        dimension: 'city',
        metric: 'orders',
      },
      shot: {
        title: 'Set up orders by city',
        caption: 'On the **Display** tab, set the map\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd03-table-country-growth',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 11, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT bucket AS country,
       round(revenue_this_year, 2) AS revenue_this_year,
       round(revenue_same_period_last_year, 2) AS revenue_same_period_last_year,
       round(100.0 * (revenue_this_year / nullif(revenue_same_period_last_year, 0) - 1), 2) AS growth_pct
FROM (SELECT CASE WHEN c.orders_this_year >= 150 THEN c.country ELSE 'Other countries' END AS bucket,
             sum(c.revenue_this_year) AS revenue_this_year,
             sum(c.revenue_same_period_last_year) AS revenue_same_period_last_year
      FROM (SELECT g.country AS country,
                   count(CASE WHEN o.order_ts >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) THEN 1 END) AS orders_this_year,
                   sum(CASE WHEN o.order_ts >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) THEN o.total_amount ELSE 0 END) AS revenue_this_year,
                   sum(CASE WHEN o.order_ts >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 1 YEAR AND o.order_ts < (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 1 YEAR + INTERVAL 1 DAY THEN o.total_amount ELSE 0 END) AS revenue_same_period_last_year
            FROM dash_demo.orders o
            JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
            WHERE o.status <> 'cancelled'
              AND g.region = \${region}
              AND g.country IN (\${countries})
            GROUP BY 1) c
      GROUP BY 1) f
ORDER BY CASE WHEN bucket = 'Other countries' THEN 1 ELSE 0 END, growth_pct DESC`,
      shot: {
        title: 'The query for country growth',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show country growth as tabulator',
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
        title: 'Set up country growth',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 8, h: 5 },
        { x: 8, y: 1, w: 4, h: 5 },
        { x: 0, y: 6, w: 12, h: 5 },
        { x: 0, y: 11, w: 12, h: 4 },
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

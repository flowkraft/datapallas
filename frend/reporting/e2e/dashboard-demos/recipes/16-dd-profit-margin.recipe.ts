// Dashboard Demo 16, Profit & Margin: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-profit-margin, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-profit-margin',
  nn: 16,
  title: 'Profit & Margin',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 7 quarter, startOf quarter}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'category', type: 'String', label: 'Category') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All categories --\\' AS label UNION ALL SELECT DISTINCT p.category AS value, p.category AS label FROM dash_demo.products p ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (From, To, Category).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd16-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Profit & Margin

Q4 discounting costs about six points of margin every year: the discount rate runs near 6% for three quarters and 14.5% in Q4, and margin falls from 33.49% to 27.94% in 2024 and from 35.35% to 29.03% in 2025 - every category gives ground, Laptops most of all.

The board pack, in reading order: what the margin is, what it left and how much of it was given away; then margin against revenue month by month, on a second axis, so the Q4 dips show themselves; then where the money goes between the price on the label and the profit, and which categories dip in Q4. The period is the board's - the last eight quarters, so both Q4s are on the page - and **category** isolates the one the board asks about.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickCube',
      key: 'w-dd16-kpi-gross-margin',
      cubeId: 'dd-sales',
      grid: { x: 0, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Pick the dd-sales cube',
        caption: 'In the schema browser, pick the cube **dd-sales**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['MarginPct'],
        filters: [{ member: 'OrderedAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        bindings: [
          { param: 'dateFrom', member: 'OrderedAt', operator: 'greater_or_equal' },
          { param: 'category', member: 'Category', operator: 'equals' },
        ],
      },
      shot: { title: 'Tick the fields of gross margin', caption: 'Tick **MarginPct**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show gross margin as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'MarginPct', numberLabel: 'Gross margin %', numberFormat: 'percent' },
      shot: {
        title: 'Set up gross margin',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd16-kpi-gross-profit',
      cubeId: 'dd-sales',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Pick the dd-sales cube',
        caption: 'In the schema browser, pick the cube **dd-sales**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['GrossProfit'],
        filters: [{ member: 'OrderedAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        bindings: [
          { param: 'dateFrom', member: 'OrderedAt', operator: 'greater_or_equal' },
          { param: 'category', member: 'Category', operator: 'equals' },
        ],
      },
      shot: { title: 'Tick the fields of gross profit', caption: 'Tick **GrossProfit**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show gross profit as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'GrossProfit', numberLabel: 'Gross profit', numberFormat: 'currency' },
      shot: {
        title: 'Set up gross profit',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd16-kpi-discounts-given',
      table: 'dash_demo.order_lines',
      grid: { x: 8, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(l.qty * l.unit_price * l.discount_pct / 100.0), 2) AS discounts_given
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND o.order_ts >= \${dateFrom}
  AND o.order_ts < \${dateTo__next_day}
  AND p.category = \${category}`,
      shot: {
        title: 'The query for discounts given',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show discounts given as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'discounts_given', numberLabel: 'Discounts given', numberFormat: 'currency' },
      shot: {
        title: 'Set up discounts given',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd16-chart-revenue-and-margin-per-month',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 3, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(date_trunc('month', o.order_ts), '%Y-%m') AS month,
       round(sum(l.line_amount), 2) AS revenue,
       round(100.0 * sum(l.line_amount - l.line_cost) / sum(l.line_amount), 2) AS margin_pct
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND o.order_ts >= \${dateFrom}
  AND o.order_ts < \${dateTo__next_day}
  AND p.category = \${category}
GROUP BY month
ORDER BY month`,
      shot: {
        title: 'The query for revenue and margin per month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue and margin per month as chart',
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
            datasets: [
              { field: 'revenue', label: 'Revenue' },
              { field: 'margin_pct', label: 'Margin %', yAxisID: 'y1' },
            ],
          },
          options: {
            plugins: { title: { display: true, text: 'Revenue and margin % per month' } },
            scales: {
              y: { position: 'left', title: { display: true, text: 'Revenue' } },
              y1: {
                position: 'right',
                title: { display: true, text: 'Margin %' },
                grid: { drawOnChartArea: false },
              },
            },
          },
        },
      },
      dsl: `chart {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
      }
      dataset {
        field 'margin_pct'
        label 'Margin %'
        yAxisID 'y1'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue and margin % per month'
      }
    }
    scales {
      y {
        position 'left'
        title {
          display true
          text 'Revenue'
        }
      }
      y1 {
        position 'right'
        title {
          display true
          text 'Margin %'
        }
        grid {
          drawOnChartArea false
        }
      }
    }
  }
}
`,
      shot: {
        title: 'Set up revenue and margin per month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd16-chart-waterfall-list-price-to-gross-profit',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 7, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Where the money goes between the price on the label and the profit left: the discount given away,
// then what the goods cost. The three steps run from the running total before them, so the level the
// last one lands on is the gross profit the r1 tile shows.
dbSql.rows("""WITH scope AS (
  SELECT l.qty * l.unit_price AS list_amount,
         l.qty * l.unit_price * l.discount_pct / 100.0 AS discount_amount,
         l.line_amount AS revenue,
         l.line_cost AS cost
  FROM dash_demo.order_lines l
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  WHERE o.status <> 'cancelled'
    AND o.order_ts >= CAST(? AS DATE)
    AND o.order_ts < CAST(? AS DATE) + INTERVAL 1 DAY
    AND (? = '' OR p.category = ?)
)
SELECT 1 AS ord, 'Revenue at list price' AS step, round(sum(list_amount), 2) AS amount FROM scope
UNION ALL SELECT 2, 'Discounts', -round(sum(discount_amount), 2) FROM scope
UNION ALL SELECT 3, 'Cost of goods sold', -round(sum(cost), 2) FROM scope
ORDER BY ord""", [dateFrom, dateTo, category, category])`,
      shot: {
        title: 'The script for waterfall list price to gross profit',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show waterfall list price to gross profit as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'waterfall',
          data: {
            labelField: 'step',
            datasets: [{ field: 'amount', label: 'From list price to gross profit' }],
          },
          options: {
            plugins: {
              title: {
                display: true,
                text: 'From list price to gross profit: discounts and cost of goods',
              },
            },
          },
        },
      },
      dsl: `chart {
  type 'waterfall'
  data {
    labelField 'step'
    datasets {
      dataset {
        field 'amount'
        label 'From list price to gross profit'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'From list price to gross profit: discounts and cost of goods'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up waterfall list price to gross profit',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd16-pivot-margin-by-category-quarter',
      cubeId: 'dd-sales',
      grid: { x: 6, y: 7, w: 6, h: 5 },
      shot: {
        title: 'Pick the dd-sales cube',
        caption: 'In the schema browser, pick the cube **dd-sales**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: ['Category', 'OrderedAt'],
        measures: ['MarginPct'],
        granularities: { OrderedAt: 'quarter' },
        filters: [{ member: 'OrderedAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        order: [{ member: 'Category', dir: 'asc' }, { member: 'OrderedAt', dir: 'asc' }],
        limit: 500,
        bindings: [
          { param: 'dateFrom', member: 'OrderedAt', operator: 'greater_or_equal' },
          { param: 'category', member: 'Category', operator: 'equals' },
        ],
      },
      shot: {
        title: 'Tick the fields of margin by category quarter',
        caption: 'Tick **Category, OrderedAt, MarginPct**.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: {
        title: 'Show margin by category quarter as pivot',
        caption: 'Under **Visualize as**, choose **pivot**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'pivot',
      config: {},
      dsl: `pivotTable {
  rows([
    'Category'
  ])
  cols([
    'OrderedAt'
  ])
  vals([
    'MarginPct'
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
        title: 'Set up margin by category quarter',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 2 },
        { x: 4, y: 1, w: 4, h: 2 },
        { x: 8, y: 1, w: 4, h: 2 },
        { x: 0, y: 3, w: 12, h: 4 },
        { x: 0, y: 7, w: 6, h: 5 },
        { x: 6, y: 7, w: 6, h: 5 },
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

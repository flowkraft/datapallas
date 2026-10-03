// Dashboard Demo 05, Product Performance: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-product-performance, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-product-performance',
  nn: 5,
  title: 'Product Performance',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'category', type: 'String', label: 'Category') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All categories --\\' AS label UNION ALL SELECT DISTINCT category AS value, category AS label FROM dash_demo.products ORDER BY label')
  }
  parameter(id: 'topN', type: 'Integer', label: 'How many', defaultValue: 10) {
    constraints(required: true)
    ui(control: 'select', options: [[value: 5, label: '5'], [value: 10, label: '10'], [value: 25, label: '25']])
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Category, How many).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd05-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Product Performance

Products rated under 3.5 stars sell about 40% fewer units per product; the AeroDesk Pro standing desk (3.2 stars) has a 17.5% return rate since April 2026.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd05-chart-rating-vs-units',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 1, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.rating AS rating,
       sum(l.qty) AS units,
       p.name AS product
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND p.category = \${category}
GROUP BY 1, 3
ORDER BY rating`,
      shot: {
        title: 'The query for rating vs units',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show rating vs units as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'scatter',
          data: { labelField: 'rating', datasets: [{ field: 'units', label: 'Units sold' }] },
          options: {
            plugins: { title: { display: true, text: 'Rating against units sold, one dot per product' } },
          },
        },
      },
      dsl: `chart {
  type 'scatter'
  data {
    labelField 'rating'
    datasets {
      dataset {
        field 'units'
        label 'Units sold'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Rating against units sold, one dot per product'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up rating vs units',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd05-chart-discount-vs-return-rate',
      table: 'dash_demo.order_lines',
      grid: { x: 6, y: 1, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.name AS product,
       round(avg(l.discount_pct), 2) AS discount_pct,
       round(100.0 * count(DISTINCT CASE WHEN o.status = 'returned' THEN o.order_id END)
             / count(DISTINCT o.order_id), 2) AS return_rate_pct,
       round(sum(l.line_amount), 2) AS revenue,
       round(4 + 20.0 * sum(l.line_amount) / max(sum(l.line_amount)) OVER (), 1) AS bubble_size
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.order_ts >= date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 5 MONTH
  AND p.category = \${category}
GROUP BY 1
ORDER BY return_rate_pct DESC`,
      shot: {
        title: 'The query for discount vs return rate',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show discount vs return rate as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bubble',
          data: {
            labelField: 'discount_pct',
            datasets: [{ field: 'return_rate_pct', label: 'Return rate %' }],
          },
          options: {
            bubbleSizeField: 'bubble_size',
            plugins: {
              title: {
                display: true,
                text: 'Discount % against return rate, sized by revenue, last six months',
              },
            },
          },
        },
      },
      dsl: `chart {
  type 'bubble'
  data {
    labelField 'discount_pct'
    datasets {
      dataset {
        field 'return_rate_pct'
        label 'Return rate %'
      }
    }
  }
  options {
    bubbleSizeField 'bubble_size'
    plugins {
      title {
        display true
        text 'Discount % against return rate, sized by revenue, last six months'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up discount vs return rate',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd05-chart-top-n-by-margin',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 5, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.name AS product,
       round(sum(l.line_amount - l.line_cost), 2) AS gross_margin
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND p.category = \${category}
GROUP BY 1
ORDER BY gross_margin DESC
LIMIT \${topN}`,
      shot: {
        title: 'The query for top n by margin',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show top n by margin as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'product', datasets: [{ field: 'gross_margin', label: 'Gross margin' }] },
          options: { plugins: { title: { display: true, text: 'Top by gross margin' } } },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'gross_margin'
        label 'Gross margin'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Top by gross margin'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up top n by margin',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd05-chart-bottom-n-by-margin',
      table: 'dash_demo.order_lines',
      grid: { x: 6, y: 5, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.name AS product,
       round(sum(l.line_amount - l.line_cost), 2) AS gross_margin
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND p.category = \${category}
GROUP BY 1
ORDER BY gross_margin ASC
LIMIT \${topN}`,
      shot: {
        title: 'The query for bottom n by margin',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show bottom n by margin as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'product', datasets: [{ field: 'gross_margin', label: 'Gross margin' }] },
          options: { plugins: { title: { display: true, text: 'Bottom by gross margin' } } },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'gross_margin'
        label 'Gross margin'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Bottom by gross margin'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up bottom n by margin',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd05-table-all-products',
      table: 'dash_demo.products',
      grid: { x: 0, y: 9, w: 12, h: 5 },
      shot: { title: 'Pick the products table', caption: 'In the schema browser, pick **products**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [{ column: 'category', operator: 'equals', value: '${category}' }],
        sort: [{ column: 'name', direction: 'asc' }],
      },
      shot: {
        title: 'Build the query for all products',
        caption: 'Fill the Visual tab: the filters, grouping and sort, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show all products as tabulator',
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
          paginationSize: 25,
          theme: 'modern',
          autoColumnsDefinitions: [{ field: 'product_id', visible: false }, { field: 'subcategory', visible: false }],
        },
      },
      shot: {
        title: 'Set up all products',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 6, h: 4 },
        { x: 6, y: 1, w: 6, h: 4 },
        { x: 0, y: 5, w: 6, h: 4 },
        { x: 6, y: 5, w: 6, h: 4 },
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

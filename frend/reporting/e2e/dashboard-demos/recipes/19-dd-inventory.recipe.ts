// Dashboard Demo 19, Inventory & Stock Health: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-inventory, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-inventory',
  nn: 19,
  title: 'Inventory & Stock Health',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'warehouse', type: 'String', label: 'Warehouse') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All warehouses --\\' AS label UNION ALL SELECT w.name AS value, w.name AS label FROM dash_demo.warehouses w ORDER BY label')
  }
  parameter(id: 'belowReorderOnly', type: 'Boolean', label: 'Below reorder level only', defaultValue: true) {
    constraints(required: false)
    ui(control: 'checkbox')
  }
  parameter(id: 'category', type: 'String', label: 'Category', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT pr.category AS value, pr.category AS label FROM dash_demo.products pr ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Warehouse, Below reorder level only, Category).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd19-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Inventory & Stock Health

14 SKUs are below their reorder level, 4 of them in Rotterdam, and Rotterdam is the warehouse with no room left: 94% of capacity against 71% in Frankfurt and 52% in Sao Paulo. 62,110.83 sits in 9 slow movers that have not sold in 90 days, none of them worth more than 6,979.31 on its own, and every one of them is in a different building - so the money to free is spread thin while the space problem is in one place.

The money in stock, the size of today's ordering job and the money stuck, then where there is room and what to clear, then the list to act on. **Below reorder level only** is ticked, so the table is today's reorder list; untick it to see all 1,000 stock rows. It moves the table alone - the three numbers keep their own meaning. Space used counts everything in a building, so it does not narrow with **Category**.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-kpi-stock-value',
      table: 'dash_demo.stock_levels',
      grid: { x: 0, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(sl.qty_on_hand * pr.unit_cost), 2) AS stock_value
FROM dash_demo.stock_levels sl
JOIN dash_demo.products pr ON pr.product_id = sl.product_id
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
  AND pr.category IN (\${category})`,
      shot: {
        title: 'The query for stock value',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show stock value as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'stock_value', numberLabel: 'Stock value', numberFormat: 'currency' },
      shot: {
        title: 'Set up stock value',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-kpi-skus-below-reorder',
      table: 'dash_demo.stock_levels',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS skus_below_reorder
FROM dash_demo.stock_levels sl
JOIN dash_demo.products pr ON pr.product_id = sl.product_id
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
  AND pr.category IN (\${category})
  AND sl.qty_on_hand < sl.reorder_level`,
      shot: {
        title: 'The query for skus below reorder',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show skus below reorder as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'skus_below_reorder',
        numberLabel: 'SKUs below reorder level',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up skus below reorder',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-kpi-slow-mover-value',
      table: 'dash_demo.stock_levels',
      grid: { x: 8, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(sl.qty_on_hand * pr.unit_cost), 2) AS slow_mover_value
FROM dash_demo.stock_levels sl
JOIN dash_demo.products pr ON pr.product_id = sl.product_id
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
  AND pr.category IN (\${category})
  AND (sl.last_sold_date IS NULL OR sl.last_sold_date < (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 90 DAY)`,
      shot: {
        title: 'The query for slow mover value',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show slow mover value as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'slow_mover_value',
        numberLabel: 'Slow-mover value, no sale in 90 days',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up slow mover value',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-chart-space-used-by-warehouse',
      table: 'dash_demo.stock_levels',
      grid: { x: 0, y: 3, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT w.name AS warehouse,
       round(100.0 * sum(sl.qty_on_hand) / max(w.capacity_units), 2) AS capacity_pct
FROM dash_demo.stock_levels sl
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
GROUP BY w.name
ORDER BY capacity_pct DESC`,
      shot: {
        title: 'The query for space used by warehouse',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show space used by warehouse as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'warehouse', datasets: [{ field: 'capacity_pct', label: '% of capacity' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Space used by warehouse, % of capacity' },
              legend: { display: false },
            },
            scales: { y: { suggestedMax: 100 } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'warehouse'
    datasets {
      dataset {
        field 'capacity_pct'
        label '% of capacity'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Space used by warehouse, % of capacity'
      }
      legend {
        display false
      }
    }
    scales {
      y {
        suggestedMax 100
      }
    }
  }
}
`,
      shot: {
        title: 'Set up space used by warehouse',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-chart-slow-movers-by-value',
      table: 'dash_demo.stock_levels',
      grid: { x: 6, y: 3, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT pr.sku || ' ' || pr.name AS product,
       round(sum(sl.qty_on_hand * pr.unit_cost), 2) AS stuck_value
FROM dash_demo.stock_levels sl
JOIN dash_demo.products pr ON pr.product_id = sl.product_id
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
  AND pr.category IN (\${category})
  AND (sl.last_sold_date IS NULL OR sl.last_sold_date < (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 90 DAY)
GROUP BY pr.sku, pr.name
ORDER BY stuck_value DESC
LIMIT 10`,
      shot: {
        title: 'The query for slow movers by value',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show slow movers by value as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'product', datasets: [{ field: 'stuck_value', label: 'Value stuck' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Slow movers by value, no sale in 90 days' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'stuck_value'
        label 'Value stuck'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Slow movers by value, no sale in 90 days'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up slow movers by value',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd19-table-stock-by-sku',
      table: 'dash_demo.stock_levels',
      grid: { x: 0, y: 8, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on stock_levels',
        caption: 'In the schema browser, pick **stock_levels**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT pr.sku AS sku,
       pr.name AS product,
       pr.category AS category,
       w.name AS warehouse,
       sl.qty_on_hand AS qty_on_hand,
       sl.reorder_level AS reorder_level,
       greatest(sl.reorder_level - sl.qty_on_hand, sl.reorder_qty) AS suggested_order
FROM dash_demo.stock_levels sl
JOIN dash_demo.products pr ON pr.product_id = sl.product_id
JOIN dash_demo.warehouses w ON w.warehouse_id = sl.warehouse_id
WHERE true
  AND w.name = \${warehouse}
  AND pr.category IN (\${category})
  AND (sl.qty_on_hand < sl.reorder_level OR NOT \${belowReorderOnly})
ORDER BY suggested_order DESC, pr.sku`,
      shot: {
        title: 'The query for stock by sku',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show stock by sku as tabulator',
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
          theme: 'bootstrap5',
        },
        columnSettings: {
          sku: { columnTitle: 'SKU' },
          product: { columnTitle: 'Product' },
          qty_on_hand: { columnTitle: 'On hand' },
          reorder_level: { columnTitle: 'Reorder level' },
          suggested_order: { columnTitle: 'Suggested order' },
        },
      },
      shot: {
        title: 'Set up stock by sku',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 2 },
        { x: 4, y: 1, w: 4, h: 2 },
        { x: 8, y: 1, w: 4, h: 2 },
        { x: 0, y: 3, w: 6, h: 5 },
        { x: 6, y: 3, w: 6, h: 5 },
        { x: 0, y: 8, w: 12, h: 4 },
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

// Dashboard Demo 19, Inventory & Stock Health (low-code): the same dashboard as
// 19-dd-inventory.recipe.ts, built with less code (plan-dashboard-demos-low-code.md, TODO 7 and 8).
// Against the original: the filters through the form; stock value and SKUs below reorder level from
// the dd-inventory cube, bound to the filters, not SQL; charts by the pickers where they say it all.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-inventory-low-code',
  nn: 19,
  title: 'Inventory & Stock Health (low-code)',
  steps: [
    {
      kind: 'filters',
      via: 'form',
      params: [
        {
          id: 'warehouse',
          type: 'String',
          label: 'Warehouse',
          constraints: { required: false },
          uiHints: {
            control: 'select',
            options: 'SELECT \'\' AS value, \'-- All warehouses --\' AS label UNION ALL SELECT w.name AS value, w.name AS label FROM dash_demo.warehouses w ORDER BY label',
          },
        },
        {
          id: 'belowReorderOnly',
          type: 'Boolean',
          label: 'Below reorder level only',
          defaultValue: true,
          constraints: { required: false },
          uiHints: { control: 'checkbox' },
        },
        {
          id: 'category',
          type: 'String',
          label: 'Category',
          defaultValue: [],
          constraints: { required: false },
          uiHints: {
            control: 'multiselect',
            options: 'SELECT DISTINCT pr.category AS value, pr.category AS label FROM dash_demo.products pr ORDER BY label',
          },
        },
      ],
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters** and add each filter in the form (Warehouse, Below reorder level only, Category): its label, id, type, control, default and options.',
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
      kind: 'pickCube',
      key: 'w-dd19-kpi-stock-value',
      cubeId: 'dd-inventory',
      grid: { x: 0, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Pick the dd-inventory cube',
        caption: 'In the schema browser, pick the cube **dd-inventory**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['StockValue'],
        bindings: [
          { param: 'warehouse', member: 'Warehouse', operator: 'equals' },
          { param: 'category', member: 'Category', operator: 'in' },
        ],
      },
      shot: { title: 'Tick the fields of stock value', caption: 'Tick **StockValue**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show stock value as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'StockValue', numberLabel: 'Stock value', numberFormat: 'currency' },
      shot: {
        title: 'Set up stock value',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd19-kpi-skus-below-reorder',
      cubeId: 'dd-inventory',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Pick the dd-inventory cube',
        caption: 'In the schema browser, pick the cube **dd-inventory**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['BelowReorder'],
        bindings: [
          { param: 'warehouse', member: 'Warehouse', operator: 'equals' },
          { param: 'category', member: 'Category', operator: 'in' },
        ],
      },
      shot: {
        title: 'Tick the fields of skus below reorder',
        caption: 'Tick **BelowReorder**.',
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
        numberField: 'BelowReorder',
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
      shot: {
        title: 'Set up slow movers by value',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend with the pickers.',
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
        widgetTitle: 'Stock by SKU',
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

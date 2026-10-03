// Dashboard Demo 23, Table Profile: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-table-profile, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-table-profile',
  nn: 23,
  title: 'Table Profile',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'tableName', type: 'String', label: 'Table', defaultValue: 'support_tickets') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT table_name AS value, table_name AS label FROM information_schema.tables WHERE table_schema = \\'dash_demo\\' ORDER BY label')
  }
  parameter(id: 'columnName', type: 'String', label: 'Column', defaultValue: 'priority') {
    constraints(required: true)
    ui(control: 'text')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Table, Column).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd23-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Table Profile

Pick any table and you know it in half a minute: support_tickets holds 14,000 rows over 15 columns, 476 of them opened in the last 30 days, and 4 columns have gaps - order_id is empty on 52.64% of tickets, because a ticket need not be about an order, and csat_score on 58.33%, because most people never answer the survey. Its priority column is 51.56% normal and 8.21% urgent. Point the same page at orders.total_amount and the chart turns into twenty ranges over 23,162 distinct amounts, 20,782 orders inside the first one.

Size, freshness and gaps first, then what every column holds, then the one column you asked about. **Type a table and a column** - the page is the only one where the table itself is a filter, and every tile checks both names against \`information_schema\` before it builds a query, so a name that is not there shows nothing rather than running. **Rows added in the last 30 days** is empty for a table with no column that records a beginning, and the distribution chart draws twenty ranges for a numeric column and the twenty commonest values for any other.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-kpi-rows',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
dbSql.rows("""SELECT count(*) AS row_count
FROM dash_demo.\${tableName}""", [])`,
      shot: {
        title: 'The script for rows',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show rows as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'row_count', numberLabel: 'Rows', numberFormat: 'number' },
      shot: {
        title: 'Set up rows',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-kpi-columns',
      table: 'dash_demo.orders',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
dbSql.rows("""SELECT count(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'dash_demo'
  AND table_name = ?""", [tableName])`,
      shot: {
        title: 'The script for columns',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show columns as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'column_count', numberLabel: 'Columns', numberFormat: 'number' },
      shot: {
        title: 'Set up columns',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-kpi-rows-added-last-30-days',
      table: 'dash_demo.as_of',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
// The first date or timestamp column whose name speaks of a beginning. A table with
// none of them has no freshness to show, and the tile stays empty.
def created = dbSql.firstRow("SELECT column_name FROM information_schema.columns WHERE table_schema = 'dash_demo' AND table_name = ? AND data_type IN ('DATE', 'TIMESTAMP') AND (column_name LIKE '%created%' OR column_name LIKE '%opened%' OR column_name LIKE '%signup%' OR column_name LIKE '%issue%' OR column_name LIKE '%order_ts%' OR column_name LIKE '%hire%' OR column_name LIKE '%period%' OR column_name LIKE '%started%') ORDER BY ordinal_position LIMIT 1", [tableName])?.column_name
if (created == null) return []
dbSql.rows("""SELECT count(*) AS rows_added
FROM dash_demo.\${tableName}
WHERE \${created} >= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 30 DAY
  AND \${created} <= (SELECT a.as_of FROM dash_demo.as_of a)""", [])`,
      shot: {
        title: 'The script for rows added last 30 days',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show rows added last 30 days as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'rows_added',
        numberLabel: 'Rows added in the last 30 days',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up rows added last 30 days',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-kpi-columns-with-nulls',
      table: 'dash_demo.orders',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
dbSql.rows("""SELECT count(*) AS columns_with_nulls
FROM (SUMMARIZE dash_demo.\${tableName})
WHERE null_percentage > 0""", [])`,
      shot: {
        title: 'The script for columns with nulls',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show columns with nulls as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'columns_with_nulls',
        numberLabel: 'Columns with NULLs',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up columns with nulls',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-table-column-profile',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 4, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
dbSql.rows("""SELECT s.column_name AS column_name,
       s.column_type AS column_type,
       CASE WHEN right(s.column_name, 3) = '_id' THEN 'key'
            WHEN s.column_type IN ('DATE', 'TIMESTAMP') THEN 'when'
            WHEN s.column_type = 'BOOLEAN' THEN 'flag'
            WHEN s.column_name LIKE '%amount%' OR s.column_name LIKE '%price%'
                 OR s.column_name LIKE '%cost%' OR s.column_name LIKE '%pay%'
                 OR s.column_name LIKE '%qty%' OR s.column_name LIKE '%score%'
                 OR s.column_name LIKE '%limit%' OR s.column_name LIKE '%fee%' THEN 'measure'
            ELSE 'attribute'
       END AS role_guessed_from_the_name,
       s.null_percentage AS null_percentage,
       s.approx_unique AS distinct_values_approx,
       s.min AS smallest,
       s.avg AS average,
       s.max AS largest
FROM (SUMMARIZE dash_demo.\${tableName}) s
JOIN information_schema.columns c
  ON c.table_schema = 'dash_demo' AND c.table_name = ? AND c.column_name = s.column_name
ORDER BY c.ordinal_position""", [tableName])`,
      shot: {
        title: 'The script for column profile',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show column profile as tabulator',
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
        columnSettings: {
          column_name: { columnTitle: 'Column' },
          column_type: { columnTitle: 'Type' },
          role_guessed_from_the_name: { columnTitle: 'Role, guessed' },
          null_percentage: { columnTitle: 'Nulls %' },
          distinct_values_approx: { columnTitle: 'Distinct, approximate' },
          smallest: { columnTitle: 'Min' },
          average: { columnTitle: 'Average' },
          largest: { columnTitle: 'Max' },
        },
      },
      shot: {
        title: 'Set up column profile',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd23-chart-distribution',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 9, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Whitelisted, never trusted: the name must be a table of dash_demo before it goes
// anywhere near a query, because it lands in FROM where no bind can carry it.
if (!dbSql.firstRow("SELECT 1 FROM information_schema.tables WHERE table_schema = 'dash_demo' AND table_name = ?", [tableName])) return []
if (!dbSql.firstRow("SELECT 1 FROM information_schema.columns WHERE table_schema = 'dash_demo' AND table_name = ? AND column_name = ?", [tableName, columnName])) return []
dbSql.rows("""WITH v AS (
  SELECT CAST(\${columnName} AS VARCHAR) AS txt,
         TRY_CAST(CAST(\${columnName} AS VARCHAR) AS DOUBLE) AS num
  FROM dash_demo.\${tableName}
),
shape AS (
  SELECT count(txt) AS filled, count(num) AS numeric_rows,
         count(DISTINCT txt) AS distinct_values,
         min(num) AS lo, max(num) AS hi
  FROM v
),
bucketed AS (
  SELECT CASE WHEN s.numeric_rows = s.filled AND s.distinct_values > 20
              THEN least(19, CAST(floor((v.num - s.lo) / nullif(s.hi - s.lo, 0) * 20) AS INTEGER))
         END AS bin,
         v.txt AS txt, v.num AS num, s.lo AS lo, s.hi AS hi
  FROM v, shape s
  WHERE v.txt IS NOT NULL
)
SELECT CASE WHEN b.bin IS NULL THEN b.txt
            ELSE printf('%.2f - %.2f',
                        b.lo + (b.hi - b.lo) * b.bin / 20.0,
                        b.lo + (b.hi - b.lo) * (b.bin + 1) / 20.0)
       END AS bucket,
       count(*) AS rows_in_bucket
FROM bucketed b
GROUP BY bucket, b.bin
ORDER BY b.bin NULLS LAST, rows_in_bucket DESC, bucket
LIMIT 20""", [])`,
      shot: {
        title: 'The script for distribution',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show distribution as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'bucket', datasets: [{ field: 'rows_in_bucket', label: 'Rows' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Distribution of the chosen column' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'bucket'
    datasets {
      dataset {
        field 'rows_in_bucket'
        label 'Rows'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Distribution of the chosen column'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up distribution',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
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
        { x: 0, y: 4, w: 12, h: 5 },
        { x: 0, y: 9, w: 12, h: 4 },
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

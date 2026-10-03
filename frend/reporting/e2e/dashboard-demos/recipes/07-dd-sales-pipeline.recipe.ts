// Dashboard Demo 07, Sales Pipeline: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-sales-pipeline, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-sales-pipeline',
  nn: 7,
  title: 'Sales Pipeline',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'repEmployeeId', type: 'String', label: 'Rep') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All reps --\\' AS label UNION ALL SELECT DISTINCT e.employee_id::VARCHAR AS value, e.name AS label FROM dash_demo.rep_quotas q JOIN dash_demo.employees e ON e.employee_id = q.employee_id ORDER BY label')
  }
  parameter(id: 'closeFrom', type: 'Date', label: 'Closing from', defaultValue: '{dataToday:startOf quarter}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'closeTo', type: 'Date', label: 'Closing to', defaultValue: '{dataToday:endOf quarter}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Rep, Closing from, Closing to).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd07-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Sales Pipeline

Referral deals win about twice as often as paid-search deals (51% against 25%), and next quarter's pipeline covers 2.1 times its quota.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-kpi-open-pipeline',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(c.amount), 2) AS open_pipeline
FROM dash_demo.crm_opportunities c
WHERE c.stage NOT IN ('won', 'lost')
  AND c.expected_close_date >= \${closeFrom}
  AND c.expected_close_date <= \${closeTo}
  AND c.owner_employee_id = \${repEmployeeId}`,
      shot: {
        title: 'The query for open pipeline',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show open pipeline as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'open_pipeline', numberLabel: 'Open pipeline', numberFormat: 'currency' },
      shot: {
        title: 'Set up open pipeline',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-kpi-weighted-pipeline',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(c.amount * c.probability_pct / 100.0), 2) AS weighted_pipeline
FROM dash_demo.crm_opportunities c
WHERE c.stage NOT IN ('won', 'lost')
  AND c.expected_close_date >= \${closeFrom}
  AND c.expected_close_date <= \${closeTo}
  AND c.owner_employee_id = \${repEmployeeId}`,
      shot: {
        title: 'The query for weighted pipeline',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show weighted pipeline as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'weighted_pipeline',
        numberLabel: 'Weighted pipeline',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up weighted pipeline',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-gauge-quota-attainment',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(
         (SELECT sum(c.amount) FROM dash_demo.crm_opportunities c
          WHERE c.stage = 'won'
            AND c.closed_date >= date_trunc('quarter', (SELECT a.as_of FROM dash_demo.as_of a))
            AND c.closed_date <= (SELECT a.as_of FROM dash_demo.as_of a)
            AND c.owner_employee_id = \${repEmployeeId}
         )
       / (SELECT sum(q.quota) FROM dash_demo.rep_quotas q
          WHERE q.quarter_start = date_trunc('quarter', (SELECT a.as_of FROM dash_demo.as_of a))
            AND q.employee_id = \${repEmployeeId}
         ), 4) AS quota_attainment`,
      shot: {
        title: 'The query for quota attainment',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: {
        title: 'Show quota attainment as gauge',
        caption: 'Under **Visualize as**, choose **gauge**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'quota_attainment',
        min: 0,
        max: 1.5,
        label: 'Quota attainment this quarter',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 1, color: '#c62828' }, { to: 1.5, color: '#2e7d32' }],
      },
      shot: {
        title: 'Set up quota attainment',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-kpi-next-quarter-cover',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(
         (SELECT sum(c.amount) FROM dash_demo.crm_opportunities c
          WHERE c.stage NOT IN ('won', 'lost')
            AND c.expected_close_date >= date_trunc('quarter', (SELECT a.as_of FROM dash_demo.as_of a)) + INTERVAL 3 MONTH
            AND c.expected_close_date < date_trunc('quarter', (SELECT a.as_of FROM dash_demo.as_of a)) + INTERVAL 6 MONTH
            AND c.owner_employee_id = \${repEmployeeId}
         )
       / (SELECT sum(q.quota) FROM dash_demo.rep_quotas q
          WHERE q.quarter_start = date_trunc('quarter', (SELECT a.as_of FROM dash_demo.as_of a)) + INTERVAL 3 MONTH
            AND q.employee_id = \${repEmployeeId}
         ), 2) AS next_quarter_cover`,
      shot: {
        title: 'The query for next quarter cover',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show next quarter cover as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'next_quarter_cover',
        numberLabel: 'Next quarter\'s pipeline / its quota',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up next quarter cover',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-chart-deals-by-stage',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 0, y: 4, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT c.stage AS stage,
       count(*) AS deals,
       round(sum(c.amount), 2) AS pipeline
FROM dash_demo.crm_opportunities c
WHERE c.stage NOT IN ('won', 'lost')
  AND c.owner_employee_id = \${repEmployeeId}
GROUP BY 1
ORDER BY deals DESC`,
      shot: {
        title: 'The query for deals by stage',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show deals by stage as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'funnel',
          data: { labelField: 'stage', datasets: [{ field: 'deals', label: 'Deals' }] },
          options: { plugins: { title: { display: true, text: 'Open deals by stage' } } },
        },
      },
      dsl: `chart {
  type 'funnel'
  data {
    labelField 'stage'
    datasets {
      dataset {
        field 'deals'
        label 'Deals'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Open deals by stage'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up deals by stage',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-chart-win-rate-by-lead-source',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 6, y: 4, w: 6, h: 5 },
      shot: {
        title: 'Start a widget on crm_opportunities',
        caption: 'In the schema browser, pick **crm_opportunities**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT c.lead_source AS lead_source,
       round(100.0 * count(CASE WHEN c.stage = 'won' THEN 1 END) / count(*), 2) AS win_rate_pct,
       count(*) AS closed_deals
FROM dash_demo.crm_opportunities c
WHERE c.stage IN ('won', 'lost')
  AND c.owner_employee_id = \${repEmployeeId}
GROUP BY 1
ORDER BY win_rate_pct DESC`,
      shot: {
        title: 'The query for win rate by lead source',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show win rate by lead source as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'lead_source', datasets: [{ field: 'win_rate_pct', label: 'Win rate %' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Win rate by lead source' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'lead_source'
    datasets {
      dataset {
        field 'win_rate_pct'
        label 'Win rate %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Win rate by lead source'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up win rate by lead source',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd07-table-open-deals',
      table: 'dash_demo.crm_opportunities',
      grid: { x: 0, y: 9, w: 12, h: 4 },
      shot: {
        title: 'Pick the crm_opportunities table',
        caption: 'In the schema browser, pick **crm_opportunities**.',
      },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          { column: 'stage', operator: 'not_in', value: 'won, lost' },
          {
            column: 'expected_close_date',
            operator: 'between',
            value: '${closeFrom}',
            valueTo: '${closeTo}',
          },
          { column: 'owner_employee_id', operator: 'equals', value: '${repEmployeeId}' },
        ],
        sort: [{ column: 'expected_close_date', direction: 'asc' }],
      },
      shot: {
        title: 'Build the query for open deals',
        caption: 'Fill the Visual tab: the filters, grouping and sort, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show open deals as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: { dslConfig: { layout: 'fitColumns', autoColumns: true, theme: 'modern' } },
      shot: {
        title: 'Set up open deals',
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
        { x: 0, y: 4, w: 6, h: 5 },
        { x: 6, y: 4, w: 6, h: 5 },
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

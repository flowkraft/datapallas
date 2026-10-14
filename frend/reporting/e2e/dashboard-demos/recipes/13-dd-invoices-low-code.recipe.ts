// Dashboard Demo 13, Invoices & Billing (low-code): the same dashboard as 13-dd-invoices.recipe.ts, built
// with less code (plan-dashboard-demos-low-code.md, TODO 7 and 8). Against the original: the filters
// through the form, not the DSL pane; the overdue amount from the dd-finance cube, not SQL; the three
// charts by the pickers, not pasted DSL. Code widgets 3 -> 2; filter and chart settings as code 4 -> 0.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-invoices-low-code',
  nn: 13,
  title: 'Invoices & Billing (low-code)',
  steps: [
    {
      kind: 'filters',
      via: 'form',
      params: [
        {
          id: 'status',
          type: 'String',
          label: 'Status',
          defaultValue: [],
          constraints: { required: false },
          uiHints: {
            control: 'multiselect',
            options: 'SELECT DISTINCT status AS value, status AS label FROM dash_demo.invoices ORDER BY label',
          },
        },
        {
          id: 'customerId',
          type: 'Integer',
          label: 'Customer',
          constraints: { required: false },
          uiHints: {
            control: 'select',
            options: "SELECT '' AS value, '-- All customers --' AS label UNION ALL SELECT CAST(c.customer_id AS VARCHAR) AS value, c.name AS label FROM dash_demo.customers c WHERE EXISTS (SELECT 1 FROM dash_demo.invoices i WHERE i.customer_id = c.customer_id) ORDER BY label",
          },
        },
        {
          id: 'issuedFrom',
          type: 'Date',
          label: 'Issued from',
          defaultValue: '{dataToday:startOf year}',
          constraints: { required: true },
          uiHints: { control: 'datepicker' },
        },
        {
          id: 'issuedTo',
          type: 'Date',
          label: 'Issued to',
          defaultValue: '{dataToday}',
          constraints: { required: true },
          uiHints: { control: 'datepicker' },
        },
      ],
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters** and add each filter in the form: Status (a multi-select whose options are a SELECT), Customer (an Integer select, its id typed as customerId), Issued from and Issued to (required dates).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd13-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Invoices & Billing

September billing is 1,098,189.32 - 98.9% of it from trade orders and 1.1% from Care plans - against 827,603.01 collected; 12.3% of the 1,637,606.29 still open is overdue.

The four numbers are the position: the first two always read the data's own month, and the open and overdue amounts are everything owed, whatever the filters say. The filters narrow the charts and the list. Invoices are one per trade order and one a month per Care-plan subscriber; consumer orders are paid at checkout and are never invoiced.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd13-kpi-billed-this-month',
      table: 'dash_demo.invoices',
      grid: { x: 0, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(i.amount + i.tax_amount), 2) AS billed_this_month
FROM dash_demo.invoices i
WHERE date_trunc('month', i.issue_date) = date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a))`,
      shot: {
        title: 'The query for billed this month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show billed this month as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'billed_this_month',
        numberLabel: 'Billed this month',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up billed this month',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd13-kpi-collected-this-month',
      table: 'dash_demo.invoice_payments',
      grid: { x: 3, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on invoice_payments',
        caption: 'In the schema browser, pick **invoice_payments**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(p.amount), 2) AS collected_this_month
FROM dash_demo.invoice_payments p
WHERE date_trunc('month', p.paid_date) = date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a))`,
      shot: {
        title: 'The query for collected this month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show collected this month as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'collected_this_month',
        numberLabel: 'Collected this month',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up collected this month',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd13-kpi-open-amount',
      cubeId: 'dd-finance',
      grid: { x: 6, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Pick the dd-finance cube',
        caption: 'In the schema browser, pick the cube **dd-finance**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: { dimensions: [], measures: ['OpenAmount'] },
      shot: { title: 'Tick the fields of open amount', caption: 'Tick **OpenAmount**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show open amount as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'OpenAmount', numberLabel: 'Open amount', numberFormat: 'currency' },
      shot: {
        title: 'Set up open amount',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd13-kpi-overdue-amount',
      cubeId: 'dd-finance',
      grid: { x: 9, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Pick the dd-finance cube',
        caption: 'In the schema browser, pick the cube **dd-finance**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: { dimensions: [], measures: ['OverdueAmount'] },
      shot: { title: 'Tick the fields of overdue amount', caption: 'Tick **OverdueAmount**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show overdue amount as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'OverdueAmount', numberLabel: 'Overdue amount', numberFormat: 'currency' },
      shot: {
        title: 'Set up overdue amount',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd13-chart-billed-per-month-by-status',
      cubeId: 'dd-finance',
      grid: { x: 0, y: 3, w: 8, h: 4 },
      shot: {
        title: 'Pick the dd-finance cube',
        caption: 'In the schema browser, pick the cube **dd-finance**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: ['IssuedAt', 'Status'],
        measures: ['Billed'],
        granularities: { IssuedAt: 'month' },
        order: [{ member: 'IssuedAt', dir: 'asc' }, { member: 'Status', dir: 'asc' }],
        limit: 500,
        bindings: [
          { param: 'issuedFrom', paramTo: 'issuedTo', member: 'IssuedAt', operator: 'between' },
          { param: 'status', member: 'Status', operator: 'in' },
        ],
      },
      shot: {
        title: 'Tick the fields of billed per month by status',
        caption: 'Tick **IssuedAt, Status, Billed**.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show billed per month by status as chart',
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
            labelField: 'IssuedAt',
            seriesField: 'Status',
            datasets: [{ field: 'Billed', label: 'Billed' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Billed per month by status' } },
            scales: { x: { stacked: true }, y: { stacked: true } },
          },
        },
      },
      shot: {
        title: 'Set up billed per month by status',
        caption: 'On the **Display** tab, set the chart\'s type, axes, series, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd13-chart-billed-by-source',
      table: 'dash_demo.invoices',
      grid: { x: 8, y: 3, w: 4, h: 4 },
      shot: { title: 'Pick the invoices table', caption: 'In the schema browser, pick **invoices**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        computed: [{ name: 'billed', left: 'amount', operator: '+', right: 'tax_amount' }],
        filters: [
          {
            column: 'issue_date',
            operator: 'between',
            value: '${issuedFrom}',
            valueTo: '${issuedTo}',
          },
          { column: 'status', operator: 'in', value: '${status}' },
          { column: 'customer_id', operator: 'equals', value: '${customerId}' },
        ],
        summarize: [{ aggregation: 'SUM', field: 'billed', share: true }],
        groupBy: ['source'],
        sort: [{ column: 'billed_sum_pct', direction: 'DESC' }],
      },
      shot: {
        title: 'Build the query for billed by source',
        caption: 'Fill the Visual tab: **Summarize → Sum of billed**, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show billed by source as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'doughnut',
          data: {
            labelField: 'source',
            datasets: [{ field: 'billed_sum_pct', label: 'Share of billing %' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Billed by source: trade orders vs Care plans' } },
          },
        },
      },
      shot: {
        title: 'Set up billed by source',
        caption: 'On the **Display** tab, set the chart\'s type, axes, series, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd13-chart-top-10-customers-by-billed',
      cubeId: 'dd-finance',
      grid: { x: 0, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Pick the dd-finance cube',
        caption: 'In the schema browser, pick the cube **dd-finance**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: ['Customer'],
        measures: ['Billed'],
        order: [{ member: 'Billed', dir: 'desc' }],
        limit: 10,
        bindings: [
          { param: 'issuedFrom', paramTo: 'issuedTo', member: 'IssuedAt', operator: 'between' },
          { param: 'status', member: 'Status', operator: 'in' },
        ],
      },
      shot: {
        title: 'Tick the fields of top 10 customers by billed',
        caption: 'Tick **Customer, Billed**.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show top 10 customers by billed as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'Customer', datasets: [{ field: 'Billed', label: 'Billed' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Top 10 customers by billed amount' },
              legend: { display: false },
            },
          },
        },
      },
      shot: {
        title: 'Set up top 10 customers by billed',
        caption: 'On the **Display** tab, set the chart\'s type, axes, series, title and legend with the pickers.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd13-table-invoices',
      table: 'dash_demo.invoices',
      grid: { x: 6, y: 7, w: 6, h: 4 },
      shot: { title: 'Pick the invoices table', caption: 'In the schema browser, pick **invoices**.' },
    },
    {
      kind: 'visualQuery',
      query: {
        filters: [
          {
            column: 'issue_date',
            operator: 'between',
            value: '${issuedFrom}',
            valueTo: '${issuedTo}',
          },
          { column: 'status', operator: 'in', value: '${status}' },
          { column: 'customer_id', operator: 'equals', value: '${customerId}' },
        ],
        sort: [{ column: 'issue_date', direction: 'DESC' }],
        limit: 5000,
      },
      shot: {
        title: 'Build the query for invoices',
        caption: 'Fill the Visual tab: the filters, grouping and sort, then run it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show invoices as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: {
        widgetTitle: 'Invoices',
        dslConfig: {
          layout: 'fitColumns',
          autoColumns: true,
          pagination: true,
          paginationSize: 12,
          theme: 'simple',
        },
        columnSettings: {
          invoice_no: { columnTitle: 'Invoice' },
          issue_date: { columnTitle: 'Issued' },
          due_date: { columnTitle: 'Due' },
          tax_amount: { columnTitle: 'Tax' },
        },
      },
      shot: {
        title: 'Set up invoices',
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
        { x: 0, y: 3, w: 8, h: 4 },
        { x: 8, y: 3, w: 4, h: 4 },
        { x: 0, y: 7, w: 6, h: 4 },
        { x: 6, y: 7, w: 6, h: 4 },
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

// Dashboard Demo 11, Customer 360: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-customer-360, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-customer-360',
  nn: 11,
  title: 'Customer 360',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'customerId', type: 'Integer', label: 'Customer', defaultValue: 1017) {
    constraints(required: true)
    ui(control: 'select', searchable: true, options: 'SELECT c.customer_id AS value, c.name AS label FROM dash_demo.customers c ORDER BY c.name, c.customer_id')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Customer).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd11-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Customer 360

Helix Retail Group has bought 1.6M over 31 months and pays on time 136 times out of 140 - but four invoices are overdue, the oldest of them 985 days past due.

One record, read across departments: the profile and what is open at the top, how the relationship is going in the middle, and at the bottom the two lists the call will touch.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-detail-customer-profile',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Who the account is, for the top of the call: the record itself, where it is, and who owns it.
dbSql.rows("""SELECT c.name AS customer,
       c.company_name AS company,
       c.customer_type AS type,
       c.segment AS segment,
       c.acquisition_channel AS acquired_through,
       c.signup_date AS customer_since,
       (SELECT count(*) FROM dash_demo.orders o WHERE o.customer_id = c.customer_id) AS orders,
       g.city AS city,
       g.country AS country,
       c.payment_terms_days AS payment_terms_days,
       c.credit_limit AS credit_limit,
       e.name AS account_manager
FROM dash_demo.customers c
JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
LEFT JOIN dash_demo.employees e ON e.employee_id = c.account_manager_id
WHERE c.customer_id = ?""", [customerId as Integer])`,
      shot: {
        title: 'The script for customer profile',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'detail',
      shot: {
        title: 'Show customer profile as detail',
        caption: 'Under **Visualize as**, choose **detail**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'detail',
      config: {
        columnSettings: {
          credit_limit: { columnTitle: 'Credit limit' },
          payment_terms_days: { columnTitle: 'Payment terms (days)' },
        },
      },
      shot: {
        title: 'Set up customer profile',
        caption: 'On the **Display** tab, set the column titles.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-kpi-lifetime-revenue',
      table: 'dash_demo.orders',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Everything the account has bought that was not cancelled.
dbSql.rows("""SELECT round(sum(o.total_amount), 2) AS lifetime_revenue
FROM dash_demo.orders o
WHERE o.status <> 'cancelled'
  AND o.customer_id = ?""", [customerId as Integer])`,
      shot: {
        title: 'The script for lifetime revenue',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show lifetime revenue as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'lifetime_revenue', numberLabel: 'Lifetime revenue', numberFormat: 'currency' },
      shot: {
        title: 'Set up lifetime revenue',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-kpi-open-invoices',
      table: 'dash_demo.invoices',
      grid: { x: 8, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The money owed: issued and not settled.
dbSql.rows("""SELECT count(*) AS open_invoices
FROM dash_demo.invoices
WHERE status IN ('open', 'overdue', 'partially_paid')
  AND customer_id = ?""", [customerId as Integer])`,
      shot: {
        title: 'The script for open invoices',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show open invoices as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'open_invoices', numberLabel: 'Open invoices', numberFormat: 'number' },
      shot: {
        title: 'Set up open invoices',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-kpi-tickets-not-closed',
      table: 'dash_demo.support_tickets',
      grid: { x: 4, y: 3, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// Still on the account: open, pending, or resolved and not yet closed out.
dbSql.rows("""SELECT count(*) AS tickets_not_closed
FROM dash_demo.support_tickets
WHERE status <> 'closed'
  AND customer_id = ?""", [customerId as Integer])`,
      shot: {
        title: 'The script for tickets not closed',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show tickets not closed as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'tickets_not_closed',
        numberLabel: 'Tickets not closed',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up tickets not closed',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-kpi-care-plan-mrr',
      table: 'dash_demo.subscriptions',
      grid: { x: 8, y: 3, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on subscriptions',
        caption: 'In the schema browser, pick **subscriptions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// What the account pays every month for its care plan, if it has one.
dbSql.rows("""SELECT round(coalesce(sum(mrr), 0), 2) AS care_plan_mrr
FROM dash_demo.subscriptions
WHERE cancel_date IS NULL
  AND customer_id = ?""", [customerId as Integer])`,
      shot: {
        title: 'The script for care plan mrr',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show care plan mrr as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'care_plan_mrr', numberLabel: 'Care plan MRR', numberFormat: 'currency' },
      shot: {
        title: 'Set up care plan mrr',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-chart-orders-per-month',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 5, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT date_trunc('month', o.order_ts) AS month,
       count(*) AS orders,
       round(sum(o.total_amount), 2) AS revenue
FROM dash_demo.orders o
WHERE o.status <> 'cancelled'
  AND o.customer_id = \${customerId}
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for orders per month',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show orders per month as chart',
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
            datasets: [{ field: 'orders', label: 'Orders' }, { field: 'revenue', label: 'Revenue' }],
          },
          options: { plugins: { title: { display: true, text: 'Orders per month' } } },
        },
      },
      dsl: `chart {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'orders'
        label 'Orders'
      }
      dataset {
        field 'revenue'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Orders per month'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up orders per month',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-chart-spend-by-category',
      table: 'dash_demo.order_lines',
      grid: { x: 8, y: 5, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT p.category AS category,
       round(sum(l.line_amount), 2) AS spend
FROM dash_demo.order_lines l
JOIN dash_demo.orders o ON o.order_id = l.order_id
JOIN dash_demo.products p ON p.product_id = l.product_id
WHERE o.status <> 'cancelled'
  AND o.customer_id = \${customerId}
GROUP BY 1
ORDER BY spend DESC`,
      shot: {
        title: 'The query for spend by category',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show spend by category as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'doughnut',
          data: { labelField: 'category', datasets: [{ field: 'spend', label: 'Spend' }] },
          options: { plugins: { title: { display: true, text: 'Spend by category' } } },
        },
      },
      dsl: `chart {
  type 'doughnut'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'spend'
        label 'Spend'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Spend by category'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up spend by category',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-table-last-20-orders',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT o.order_id AS order_id,
       CAST(o.order_ts AS DATE) AS ordered,
       o.channel AS channel,
       o.status AS status,
       o.carrier AS carrier,
       o.promised_date AS promised,
       CAST(o.delivered_ts AS DATE) AS delivered,
       round(o.total_amount, 2) AS total_amount
FROM dash_demo.orders o
WHERE o.customer_id = \${customerId}
ORDER BY o.order_ts DESC
LIMIT 20`,
      shot: {
        title: 'The query for last 20 orders',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show last 20 orders as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: { columnSettings: { total_amount: { columnTitle: 'Total' } } },
      shot: {
        title: 'Set up last 20 orders',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd11-table-tickets',
      table: 'dash_demo.support_tickets',
      grid: { x: 6, y: 9, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT t.ticket_id AS ticket_id,
       CAST(t.opened_ts AS DATE) AS opened,
       t.category AS category,
       t.priority AS priority,
       t.status AS status,
       t.channel AS channel,
       t.sla_breached AS sla_breached,
       t.csat_score AS csat
FROM dash_demo.support_tickets t
WHERE t.customer_id = \${customerId}
ORDER BY t.opened_ts DESC`,
      shot: {
        title: 'The query for tickets',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show tickets as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: {
        columnSettings: { sla_breached: { columnTitle: 'SLA breached' }, csat: { columnTitle: 'CSAT' } },
      },
      shot: {
        title: 'Set up tickets',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 4 },
        { x: 4, y: 1, w: 4, h: 2 },
        { x: 8, y: 1, w: 4, h: 2 },
        { x: 4, y: 3, w: 4, h: 2 },
        { x: 8, y: 3, w: 4, h: 2 },
        { x: 0, y: 5, w: 8, h: 4 },
        { x: 8, y: 5, w: 4, h: 4 },
        { x: 0, y: 9, w: 6, h: 4 },
        { x: 6, y: 9, w: 6, h: 4 },
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

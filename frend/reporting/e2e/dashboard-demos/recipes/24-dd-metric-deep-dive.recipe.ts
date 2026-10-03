// Dashboard Demo 24, One Metric, Every Angle: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-metric-deep-dive, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-metric-deep-dive',
  nn: 24,
  title: 'One Metric, Every Angle',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'metric', type: 'String', label: 'Metric', defaultValue: 'Revenue') {
    constraints(required: true, allowedValues: ['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'])
    ui(control: 'radio')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Metric).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd24-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## One Metric, Every Angle

Revenue is 17.5% up on the same span of last year and orders 27.55% up, while tickets grow 10.32% - support scales with the business rather than with the order book. Orders growing faster than revenue is the other half of that sentence: the average order is smaller than it was. November is the biggest month of the year for both, 8,273,224.34 and 3,165 orders against a May second place of 5,920,290.39, while payroll peaks in March and new customers in September. Germany leads all five metrics, revenue 3,651,821.21 of the 18,326,301.98 year to date.

Pick a metric on the left and the page asks it the review's six questions: where is it, how did it get here, what is it made of, is this month normal for the season, and where. **Weekday and hour are left out on purpose** - they mean nothing for a monthly metric like payroll. The numbers are the year to date and the same span of last year, to the same day, and they are written as plain numbers because the same tile shows money for revenue and a count for tickets.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-trend-metric-per-month',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT date_trunc('month', f.happened_at)::DATE AS month,
       round(sum(f.value), 2) AS value
FROM feed f
WHERE f.metric = ?
GROUP BY month
ORDER BY month""", [metric])
`,
      shot: {
        title: 'The script for metric per month',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: {
        title: 'Show metric per month as trend',
        caption: 'Under **Visualize as**, choose **trend**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: { dateField: 'month', valueField: 'value', format: 'number', label: 'Per month' },
      shot: {
        title: 'Set up metric per month',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-kpi-metric-ytd',
      table: 'dash_demo.order_lines',
      grid: { x: 4, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT round(sum(f.value), 2) AS metric_ytd
FROM feed f
WHERE f.metric = ?
  AND f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
  AND f.happened_at <= (SELECT a.as_of FROM dash_demo.as_of a)""", [metric])
`,
      shot: {
        title: 'The script for metric ytd',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show metric ytd as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'metric_ytd', numberLabel: 'Year to date', numberFormat: 'number' },
      shot: {
        title: 'Set up metric ytd',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-kpi-vs-last-year',
      table: 'dash_demo.order_lines',
      grid: { x: 8, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT round(
         sum(CASE WHEN f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
                  THEN f.value END)
         / sum(CASE WHEN f.happened_at < date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
                    THEN f.value END) - 1, 4) AS vs_last_year
FROM feed f
WHERE f.metric = ?
  AND ((f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
  AND f.happened_at <= (SELECT a.as_of FROM dash_demo.as_of a))
    OR (f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 1 YEAR
      AND f.happened_at <= (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 1 YEAR))""", [metric])
`,
      shot: {
        title: 'The script for vs last year',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show vs last year as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'vs_last_year', numberLabel: 'vs last year', numberFormat: 'percent' },
      shot: {
        title: 'Set up vs last year',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-chart-metric-over-time',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 4, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT date_trunc('month', f.happened_at)::DATE AS month,
       round(sum(f.value), 2) AS value
FROM feed f
WHERE f.metric = ?
GROUP BY month
ORDER BY month""", [metric])
`,
      shot: {
        title: 'The script for metric over time',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show metric over time as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: { labelField: 'month', datasets: [{ field: 'value', label: 'Per month' }] },
          options: {
            plugins: { title: { display: true, text: 'The metric over time' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'value'
        label 'Per month'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'The metric over time'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up metric over time',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-chart-what-it-is-made-of',
      table: 'dash_demo.order_lines',
      grid: { x: 0, y: 8, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT f.made_of AS made_of,
       round(sum(f.value), 2) AS value
FROM feed f
WHERE f.metric = ?
  AND f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
  AND f.happened_at <= (SELECT a.as_of FROM dash_demo.as_of a)
GROUP BY f.made_of
ORDER BY value DESC""", [metric])
`,
      shot: {
        title: 'The script for what it is made of',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show what it is made of as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'made_of', datasets: [{ field: 'value', label: 'Year to date' }] },
          options: {
            plugins: { title: { display: true, text: 'What it is made of' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'made_of'
    datasets {
      dataset {
        field 'value'
        label 'Year to date'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'What it is made of'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up what it is made of',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-chart-by-month-of-year',
      table: 'dash_demo.order_lines',
      grid: { x: 4, y: 8, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT strftime(f.happened_at, '%m %b') AS month_of_year,
       round(sum(f.value), 2) AS value
FROM feed f
WHERE f.metric = ?
GROUP BY month_of_year
ORDER BY month_of_year""", [metric])
`,
      shot: {
        title: 'The script for by month of year',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show by month of year as chart',
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
            labelField: 'month_of_year',
            datasets: [{ field: 'value', label: 'All years together' }],
          },
          options: {
            plugins: { title: { display: true, text: 'By month of year' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'month_of_year'
    datasets {
      dataset {
        field 'value'
        label 'All years together'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'By month of year'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up by month of year',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd24-chart-by-country-top-10',
      table: 'dash_demo.order_lines',
      grid: { x: 8, y: 8, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// The radio's five words are the whole whitelist: the chosen one goes to the database as a value,
// never as SQL text, so nothing a filter can carry reaches the query itself.
if (!['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'].contains(metric)) return []
return dbSql.rows("""WITH line_totals AS (
  SELECT l.order_id AS order_id, sum(l.line_amount) AS line_total
  FROM dash_demo.order_lines l
  GROUP BY l.order_id
),
feed AS (
  -- Revenue at line grain: each order's own total spread over its lines in proportion to what they
  -- cost, so the categories below add up to the number above them.
  SELECT 'Revenue' AS metric,
         o.order_ts AS happened_at,
         o.total_amount * l.line_amount / t.line_total AS value,
         p.category AS made_of,
         g.country AS country
  FROM dash_demo.order_lines l
  JOIN line_totals t ON t.order_id = l.order_id
  JOIN dash_demo.orders o ON o.order_id = l.order_id
  JOIN dash_demo.products p ON p.product_id = l.product_id
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'Orders', o.order_ts, 1, o.channel, g.country
  FROM dash_demo.orders o
  JOIN dash_demo.geo_cities g ON g.city_id = o.city_id
  WHERE o.status <> 'cancelled'
  UNION ALL
  SELECT 'New customers', c.signup_date, 1, c.acquisition_channel, g.country
  FROM dash_demo.customers c
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Tickets', tk.opened_ts, 1, tk.category, g.country
  FROM dash_demo.support_tickets tk
  JOIN dash_demo.customers c ON c.customer_id = tk.customer_id
  JOIN dash_demo.geo_cities g ON g.city_id = c.city_id
  UNION ALL
  SELECT 'Payroll cost', pl.period_month,
         pl.gross_pay + pl.employer_taxes + pl.benefits, d.name, g.country
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
)
SELECT f.country AS country,
       round(sum(f.value), 2) AS value
FROM feed f
WHERE f.metric = ?
  AND f.happened_at >= date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a))
  AND f.happened_at <= (SELECT a.as_of FROM dash_demo.as_of a)
GROUP BY f.country
ORDER BY value DESC
LIMIT 10""", [metric])
`,
      shot: {
        title: 'The script for by country top 10',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show by country top 10 as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'row',
          data: { labelField: 'country', datasets: [{ field: 'value', label: 'Year to date' }] },
          options: {
            plugins: { title: { display: true, text: 'By country, top 10' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'row'
  data {
    labelField 'country'
    datasets {
      dataset {
        field 'value'
        label 'Year to date'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'By country, top 10'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up by country top 10',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 3 },
        { x: 4, y: 1, w: 4, h: 3 },
        { x: 8, y: 1, w: 4, h: 3 },
        { x: 0, y: 4, w: 12, h: 4 },
        { x: 0, y: 8, w: 4, h: 4 },
        { x: 4, y: 8, w: 4, h: 4 },
        { x: 8, y: 8, w: 4, h: 4 },
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

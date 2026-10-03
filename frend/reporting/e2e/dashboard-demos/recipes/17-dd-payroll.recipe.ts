// Dashboard Demo 17, Payroll Cost: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-payroll, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-payroll',
  nn: 17,
  title: 'Payroll Cost',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'period', type: 'String', label: 'Period', defaultValue: '2026-09') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT strftime(pl.period_month, \\'%Y-%m\\') AS value, strftime(pl.period_month, \\'%Y-%m\\') AS label FROM dash_demo.payroll_lines pl ORDER BY value DESC')
  }
  parameter(id: 'department', type: 'String', label: 'Department', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT d.name AS value, d.name AS label FROM dash_demo.departments d ORDER BY d.name')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Period, Department).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd17-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Payroll Cost

Payroll grew because Engineering hired: 20 engineers joined in 2025 against 4 who left, 40 people became 56, and of the 17,000.63 a month the department costs more than a year ago, 23,530.06 is the extra people and -6,529.43 is pay - the new engineers came in below its average. Overtime is the other pressure and it is the warehouse's: about 180 hours a month, then 539.9 in November 2025 and 531.3 in December, 2.98 times the rest of the year.

The month first: what it cost, what a person was paid on average, and how many overtime hours it took. Then the trend the month sits in, department by department, and what the bill is made of. The last row is the answer the board asks for - more people, or higher pay - department by department against the same month a year earlier. Pick a **period** to move the month, and one or more **departments** to read a single team. Bonus is paid in March and December, so in any other month its slice of the doughnut is zero.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-kpi-payroll-cost',
      table: 'dash_demo.payroll_lines',
      grid: { x: 0, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(pl.gross_pay + pl.employer_taxes + pl.benefits), 2) AS payroll_cost
FROM dash_demo.payroll_lines pl
JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
JOIN dash_demo.departments d ON d.department_id = e.department_id
WHERE true
  AND strftime(pl.period_month, '%Y-%m') = \${period}
  AND d.name IN (\${department})`,
      shot: {
        title: 'The query for payroll cost',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show payroll cost as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'payroll_cost',
        numberLabel: 'Payroll cost in the period',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up payroll cost',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-kpi-average-gross-pay',
      table: 'dash_demo.payroll_lines',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(avg(pl.gross_pay), 2) AS average_gross_pay
FROM dash_demo.payroll_lines pl
JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
JOIN dash_demo.departments d ON d.department_id = e.department_id
WHERE true
  AND strftime(pl.period_month, '%Y-%m') = \${period}
  AND d.name IN (\${department})`,
      shot: {
        title: 'The query for average gross pay',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show average gross pay as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'average_gross_pay',
        numberLabel: 'Average gross pay',
        numberFormat: 'currency',
      },
      shot: {
        title: 'Set up average gross pay',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-kpi-overtime-hours',
      table: 'dash_demo.payroll_lines',
      grid: { x: 8, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(pl.overtime_hours), 2) AS overtime_hours
FROM dash_demo.payroll_lines pl
JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
JOIN dash_demo.departments d ON d.department_id = e.department_id
WHERE true
  AND strftime(pl.period_month, '%Y-%m') = \${period}
  AND d.name IN (\${department})`,
      shot: {
        title: 'The query for overtime hours',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show overtime hours as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'overtime_hours', numberLabel: 'Overtime hours', numberFormat: 'number' },
      shot: {
        title: 'Set up overtime hours',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-chart-cost-per-month-by-department',
      table: 'dash_demo.payroll_lines',
      grid: { x: 0, y: 3, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(pl.period_month, '%Y-%m') AS month,
       d.name AS department,
       round(sum(pl.gross_pay + pl.employer_taxes + pl.benefits), 2) AS total_cost
FROM dash_demo.payroll_lines pl
JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
JOIN dash_demo.departments d ON d.department_id = e.department_id
WHERE true
  AND d.name IN (\${department})
GROUP BY month, department
ORDER BY month, department`,
      shot: {
        title: 'The query for cost per month by department',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show cost per month by department as chart',
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
            labelField: 'month',
            seriesField: 'department',
            datasets: [{ field: 'total_cost', label: 'Cost' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Cost per month by department' } },
            scales: { x: { stacked: true }, y: { stacked: true } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'month'
    seriesField 'department'
    datasets {
      dataset {
        field 'total_cost'
        label 'Cost'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Cost per month by department'
      }
    }
    scales {
      x {
        stacked true
      }
      y {
        stacked true
      }
    }
  }
}
`,
      shot: {
        title: 'Set up cost per month by department',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-chart-cost-components',
      table: 'dash_demo.payroll_lines',
      grid: { x: 8, y: 3, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH scope AS (
  SELECT pl.base_pay AS base_pay,
         pl.bonus AS bonus,
         pl.overtime_pay AS overtime_pay,
         pl.employer_taxes AS employer_taxes,
         pl.benefits AS benefits
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  WHERE true
    AND strftime(pl.period_month, '%Y-%m') = \${period}
    AND d.name IN (\${department})
),
totals AS (
  SELECT round(sum(base_pay), 2) AS base_pay,
         round(sum(bonus), 2) AS bonus,
         round(sum(overtime_pay), 2) AS overtime_pay,
         round(sum(employer_taxes), 2) AS employer_taxes,
         round(sum(benefits), 2) AS benefits
  FROM scope
)
SELECT component, amount
FROM (SELECT 1 AS ord, 'Base pay' AS component, base_pay AS amount FROM totals
      UNION ALL SELECT 2, 'Bonus', bonus FROM totals
      UNION ALL SELECT 3, 'Overtime', overtime_pay FROM totals
      UNION ALL SELECT 4, 'Employer taxes', employer_taxes FROM totals
      UNION ALL SELECT 5, 'Benefits', benefits FROM totals)
ORDER BY ord`,
      shot: {
        title: 'The query for cost components',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show cost components as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'doughnut',
          data: { labelField: 'component', datasets: [{ field: 'amount', label: 'Amount' }] },
          options: { plugins: { title: { display: true, text: 'What the cost is made of' } } },
        },
      },
      dsl: `chart {
  type 'doughnut'
  data {
    labelField 'component'
    datasets {
      dataset {
        field 'amount'
        label 'Amount'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'What the cost is made of'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up cost components',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-chart-warehouse-overtime-hours',
      table: 'dash_demo.payroll_lines',
      grid: { x: 0, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(pl.period_month, '%Y-%m') AS month,
       round(sum(pl.overtime_hours), 1) AS overtime_hours
FROM dash_demo.payroll_lines pl
JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
JOIN dash_demo.departments d ON d.department_id = e.department_id
WHERE d.name = 'Warehouse'
GROUP BY month
ORDER BY month`,
      shot: {
        title: 'The query for warehouse overtime hours',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show warehouse overtime hours as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: { labelField: 'month', datasets: [{ field: 'overtime_hours', label: 'Overtime hours' }] },
          options: {
            plugins: {
              title: { display: true, text: 'Warehouse overtime hours per month' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'overtime_hours'
        label 'Overtime hours'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Warehouse overtime hours per month'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up warehouse overtime hours',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd17-table-cost-change-by-department',
      table: 'dash_demo.payroll_lines',
      grid: { x: 6, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on payroll_lines',
        caption: 'In the schema browser, pick **payroll_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH lines AS (
  SELECT d.name AS department,
         date_trunc('month', pl.period_month) AS month,
         pl.gross_pay + pl.employer_taxes + pl.benefits AS cost
  FROM dash_demo.payroll_lines pl
  JOIN dash_demo.employees e ON e.employee_id = pl.employee_id
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  WHERE true
    AND date_trunc('month', pl.period_month) IN (CAST(\${period} || '-01' AS DATE), CAST(\${period} || '-01' AS DATE) - INTERVAL 12 MONTH)
    AND d.name IN (\${department})
),
per_month AS (
  SELECT department, month, sum(cost) AS cost, count(*) AS people
  FROM lines
  GROUP BY department, month
),
paired AS (
  SELECT n.department AS department,
         n.people AS people_now,
         p.people AS people_last_year,
         n.cost AS cost_now,
         p.cost AS cost_last_year
  FROM per_month n
  JOIN per_month p
    ON p.department = n.department
   AND p.month = n.month - INTERVAL 12 MONTH
)
SELECT department,
       people_now - people_last_year AS people_change,
       round(cost_now - cost_last_year, 2) AS cost_change,
       round((people_now - people_last_year) * (cost_last_year / people_last_year), 2) AS from_more_people,
       round((cost_now / people_now - cost_last_year / people_last_year) * people_now, 2) AS from_higher_pay
FROM paired
ORDER BY cost_change DESC`,
      shot: {
        title: 'The query for cost change by department',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show cost change by department as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: {
        dslConfig: { layout: 'fitColumns', autoColumns: true, pagination: false, theme: 'midnight' },
        columnSettings: {
          department: { columnTitle: 'Department' },
          people_change: { columnTitle: 'People' },
          cost_change: { columnTitle: 'Cost change' },
          from_more_people: { columnTitle: 'From more people' },
          from_higher_pay: { columnTitle: 'From higher pay' },
        },
      },
      shot: {
        title: 'Set up cost change by department',
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

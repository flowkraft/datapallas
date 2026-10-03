// Dashboard Demo 18, Headcount & Attrition: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-headcount, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-headcount',
  nn: 18,
  title: 'Headcount & Attrition',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'department', type: 'String', label: 'Department') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All departments --\\' AS label UNION ALL SELECT d.name AS value, d.name AS label FROM dash_demo.departments d ORDER BY label')
  }
  parameter(id: 'country', type: 'String', label: 'Country') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All countries --\\' AS label UNION ALL SELECT DISTINCT g.country AS value, g.country AS label FROM dash_demo.employees e JOIN dash_demo.geo_cities g ON g.city_id = e.city_id ORDER BY label')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Department, Country).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd18-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Headcount & Attrition

Customer Support is where people leave: 17.5% a year against 9.64% for the company over the 33 months, 12 leavers from a team that averaged 25 people, and the shortest median tenure of any department at 3.1 years - 8 of its 26 people have been there under a year. Pay is the likely reason: at L1, where 10 of those 26 sit, it pays 81.7% of what everyone else at that level is paid, a median of 27,891 against 32,270; pooled over L1 to L3 it is 92.02%.

The size and the flow first: how many people there are, how many joined this year and how many left. Then the shape of it - headcount month by month, and the attrition rate each department runs over the 33 months, annualised, with the leavers it stands on in brackets. The bottom row is the two likely reasons side by side: what the same level is paid inside Customer Support and outside it, and how long people stay. Pick a **department** or a **country** to narrow the page; the salary boxes stay company-wide, because they are the comparison itself.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-kpi-headcount',
      table: 'dash_demo.employees',
      grid: { x: 0, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS headcount
FROM dash_demo.employees e
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND d.name = \${department}
  AND g.country = \${country}
  AND e.hire_date <= (SELECT a.as_of FROM dash_demo.as_of a)
  AND (e.termination_date IS NULL OR e.termination_date > (SELECT a.as_of FROM dash_demo.as_of a))`,
      shot: {
        title: 'The query for headcount',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show headcount as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'headcount', numberLabel: 'Headcount', numberFormat: 'number' },
      shot: {
        title: 'Set up headcount',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-kpi-hires-ytd',
      table: 'dash_demo.employees',
      grid: { x: 4, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS hires_ytd
FROM dash_demo.employees e
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND d.name = \${department}
  AND g.country = \${country}
  AND e.hire_date >= CAST(date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) AS DATE)
  AND e.hire_date <= (SELECT a.as_of FROM dash_demo.as_of a)`,
      shot: {
        title: 'The query for hires ytd',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show hires ytd as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'hires_ytd', numberLabel: 'Hires YTD', numberFormat: 'number' },
      shot: {
        title: 'Set up hires ytd',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-kpi-leavers-ytd',
      table: 'dash_demo.employees',
      grid: { x: 8, y: 1, w: 4, h: 2 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS leavers_ytd
FROM dash_demo.employees e
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND d.name = \${department}
  AND g.country = \${country}
  AND e.termination_date >= CAST(date_trunc('year', (SELECT a.as_of FROM dash_demo.as_of a)) AS DATE)
  AND e.termination_date <= (SELECT a.as_of FROM dash_demo.as_of a)`,
      shot: {
        title: 'The query for leavers ytd',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show leavers ytd as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'leavers_ytd', numberLabel: 'Leavers YTD', numberFormat: 'number' },
      shot: {
        title: 'Set up leavers ytd',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-chart-headcount-over-time',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 3, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(CAST(x.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 32) AS x(i)
)
SELECT strftime(m.month, '%Y-%m') AS month,
       count(*) AS headcount
FROM months m
JOIN dash_demo.employees e
  ON e.hire_date <= m.month + to_months(1) - to_days(1)
 AND (e.termination_date IS NULL OR e.termination_date > m.month + to_months(1) - to_days(1))
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND d.name = \${department}
  AND g.country = \${country}
GROUP BY m.month
ORDER BY m.month`,
      shot: {
        title: 'The query for headcount over time',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show headcount over time as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: { labelField: 'month', datasets: [{ field: 'headcount', label: 'Headcount' }] },
          options: {
            plugins: { title: { display: true, text: 'Headcount over time' }, legend: { display: false } },
          },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'headcount'
        label 'Headcount'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Headcount over time'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up headcount over time',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-chart-attrition-by-department',
      table: 'dash_demo.employees',
      grid: { x: 8, y: 3, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `WITH scope AS (
  SELECT e.department_id AS department_id,
         d.name AS department,
         e.hire_date AS hire_date,
         e.termination_date AS termination_date
  FROM dash_demo.employees e
  JOIN dash_demo.departments d ON d.department_id = e.department_id
  JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
  WHERE true
    AND d.name = \${department}
    AND g.country = \${country}
),
grouped AS (
  SELECT CASE WHEN (SELECT count(*) FROM dash_demo.employees e2
                    WHERE e2.department_id = s.department_id
                      AND e2.termination_date IS NOT NULL) >= 8
              THEN s.department ELSE 'Other departments' END AS department,
         s.hire_date AS hire_date,
         s.termination_date AS termination_date
  FROM scope s
),
months AS (
  SELECT CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(CAST(x.i AS INTEGER)) AS DATE) AS month
  FROM generate_series(0, 32) AS x(i)
),
heads AS (
  SELECT gr.department AS department, m.month AS month, count(*) AS heads
  FROM months m
  JOIN grouped gr
    ON gr.hire_date <= m.month + to_months(1) - to_days(1)
   AND (gr.termination_date IS NULL OR gr.termination_date > m.month + to_months(1) - to_days(1))
  GROUP BY gr.department, m.month
),
average_heads AS (
  SELECT department, avg(heads) AS avg_heads FROM heads GROUP BY department
),
leavers AS (
  SELECT department, count(*) AS leavers
  FROM grouped
  WHERE termination_date >= CAST(date_trunc('month', (SELECT a.as_of FROM dash_demo.as_of a)) - to_months(32) AS DATE)
    AND termination_date <= (SELECT a.as_of FROM dash_demo.as_of a)
  GROUP BY department
)
SELECT a.department || ' (' || coalesce(l.leavers, 0) || ')' AS department,
       round(100.0 * coalesce(l.leavers, 0) / a.avg_heads * 12.0 / 33.0, 2) AS attrition_pct
FROM average_heads a
LEFT JOIN leavers l ON l.department = a.department
ORDER BY attrition_pct DESC`,
      shot: {
        title: 'The query for attrition by department',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show attrition by department as chart',
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
            labelField: 'department',
            datasets: [{ field: 'attrition_pct', label: 'Attrition % a year' }],
          },
          options: {
            indexAxis: 'y',
            plugins: {
              title: { display: true, text: 'Attrition a year, over the 33 months (leavers in brackets)' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'department'
    datasets {
      dataset {
        field 'attrition_pct'
        label 'Attrition % a year'
      }
    }
  }
  options {
    indexAxis 'y'
    plugins {
      title {
        display true
        text 'Attrition a year, over the 33 months (leavers in brackets)'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up attrition by department',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-chart-boxplot-salary-by-level',
      table: 'dash_demo.employees',
      grid: { x: 0, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT e.level || ' - ' || CASE WHEN d.name = 'Customer Support'
                                THEN 'Customer Support' ELSE 'Everyone else' END AS level_and_side,
       e.base_salary_annual AS base_salary_annual
FROM dash_demo.employees e
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND g.country = \${country}
  AND e.hire_date <= (SELECT a.as_of FROM dash_demo.as_of a)
  AND (e.termination_date IS NULL OR e.termination_date > (SELECT a.as_of FROM dash_demo.as_of a))
  AND e.level IN ('L1', 'L2', 'L3')
ORDER BY level_and_side, base_salary_annual`,
      shot: {
        title: 'The query for boxplot salary by level',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show boxplot salary by level as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'boxplot',
          data: {
            labelField: 'level_and_side',
            datasets: [{ field: 'base_salary_annual', label: 'Base salary' }],
          },
          options: {
            plugins: {
              title: { display: true, text: 'Salary by level: Customer Support against everyone else' },
            },
          },
        },
      },
      dsl: `chart {
  type 'boxplot'
  data {
    labelField 'level_and_side'
    datasets {
      dataset {
        field 'base_salary_annual'
        label 'Base salary'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Salary by level: Customer Support against everyone else'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up boxplot salary by level',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd18-chart-tenure-bins',
      table: 'dash_demo.as_of',
      grid: { x: 6, y: 7, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT CASE WHEN (SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date < 365 THEN '0-1 years'
            WHEN (SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date < 730 THEN '1-2 years'
            WHEN (SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date < 1095 THEN '2-3 years'
            WHEN (SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date < 1825 THEN '3-5 years'
            WHEN (SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date < 3650 THEN '5-10 years'
            ELSE '10+ years' END AS tenure,
       count(*) AS people
FROM dash_demo.employees e
JOIN dash_demo.departments d ON d.department_id = e.department_id
JOIN dash_demo.geo_cities g ON g.city_id = e.city_id
WHERE true
  AND d.name = \${department}
  AND g.country = \${country}
  AND e.hire_date <= (SELECT a.as_of FROM dash_demo.as_of a)
  AND (e.termination_date IS NULL OR e.termination_date > (SELECT a.as_of FROM dash_demo.as_of a))
GROUP BY tenure
ORDER BY min((SELECT a.as_of FROM dash_demo.as_of a) - e.hire_date)`,
      shot: {
        title: 'The query for tenure bins',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: { title: 'Show tenure bins as chart', caption: 'Under **Visualize as**, choose **chart**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'tenure', datasets: [{ field: 'people', label: 'People' }] },
          options: {
            plugins: {
              title: { display: true, text: 'How long people have stayed' },
              legend: { display: false },
            },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'tenure'
    datasets {
      dataset {
        field 'people'
        label 'People'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'How long people have stayed'
      }
      legend {
        display false
      }
    }
  }
}
`,
      shot: {
        title: 'Set up tenure bins',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
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

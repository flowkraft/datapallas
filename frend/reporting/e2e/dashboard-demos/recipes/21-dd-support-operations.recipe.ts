// Dashboard Demo 21, Support Operations: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-support-operations, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-support-operations',
  nn: 21,
  title: 'Support Operations',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'priority', type: 'String', label: 'Priority', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: [[value: 'urgent', label: 'Urgent'], [value: 'high', label: 'High'], [value: 'normal', label: 'Normal'], [value: 'low', label: 'Low']])
  }
  parameter(id: 'team', type: 'String', label: 'Team') {
    constraints(required: false)
    ui(control: 'select', options: [[value: '', label: '-- All teams --'], [value: 'Tier 1', label: 'Tier 1'], [value: 'Technical', label: 'Technical'], [value: 'Billing', label: 'Billing'], [value: 'Returns', label: 'Returns']])
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Priority, Team).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd21-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Support Operations

Mondays 09:00-11:00 are the peak - 1,059 tickets in those three cells against 83.33 for an average hour of the week - and urgent SLA breaches spiked in June 2026 with the checkout bug: 26.32% of that month's urgent tickets breached against 8.64% in every other month, 3.05 times the rate. The queue itself is small and slightly growing: 127 open, of which 40 are urgent or high and the oldest has been waiting 45 days, and over the 142 full weeks 13,868 tickets came in against 13,770 resolved.

How much is open, what came in this week and how fast we answer, then when the load comes - which sets the rota - then whether the backlog grows and where it sits, then the tickets to assign this morning. **Open means the queue as it stands**: a ticket nobody has resolved or closed yet. The weekly line shows whole weeks only, so the last three days of a part week do not read as a collapse.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickCube',
      key: 'w-dd21-kpi-open-tickets',
      cubeId: 'dd-support',
      grid: { x: 0, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Pick the dd-support cube',
        caption: 'In the schema browser, pick the cube **dd-support**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['OpenTickets'],
        bindings: [
          { param: 'priority', member: 'Priority', operator: 'in' },
          { param: 'team', member: 'Team', operator: 'equals' },
        ],
      },
      shot: { title: 'Tick the fields of open tickets', caption: 'Tick **OpenTickets**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show open tickets as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'OpenTickets', numberLabel: 'Open tickets', numberFormat: 'number' },
      shot: {
        title: 'Set up open tickets',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-kpi-opened-last-7-days',
      table: 'dash_demo.support_tickets',
      grid: { x: 3, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS opened_last_7_days
FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
  AND t.opened_ts > (SELECT a.as_of FROM dash_demo.as_of a) - INTERVAL 7 DAY
  AND t.opened_ts < (SELECT a.as_of FROM dash_demo.as_of a) + INTERVAL 1 DAY`,
      shot: {
        title: 'The query for opened last 7 days',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show opened last 7 days as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'opened_last_7_days',
        numberLabel: 'Opened in the last 7 days',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up opened last 7 days',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd21-kpi-average-first-response',
      cubeId: 'dd-support',
      grid: { x: 6, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Pick the dd-support cube',
        caption: 'In the schema browser, pick the cube **dd-support**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: [],
        measures: ['AvgFirstResponseMinutes'],
        bindings: [
          { param: 'priority', member: 'Priority', operator: 'in' },
          { param: 'team', member: 'Team', operator: 'equals' },
        ],
      },
      shot: {
        title: 'Tick the fields of average first response',
        caption: 'Tick **AvgFirstResponseMinutes**.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show average first response as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: {
        numberField: 'AvgFirstResponseMinutes',
        numberLabel: 'Average first response, minutes',
        numberFormat: 'number',
      },
      shot: {
        title: 'Set up average first response',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-gauge-sla-met',
      table: 'dash_demo.support_tickets',
      grid: { x: 9, y: 1, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(count(CASE WHEN NOT t.sla_breached THEN 1 END) / count(*)::DOUBLE, 4) AS sla_met_rate
FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})`,
      shot: {
        title: 'The query for sla met',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: { title: 'Show sla met as gauge', caption: 'Under **Visualize as**, choose **gauge**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'sla_met_rate',
        min: 0.75,
        max: 1,
        label: 'SLA met',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 0.85, color: '#ef8c8c' }, { to: 0.9, color: '#f9d45c' }, { to: 1, color: '#88bf4d' }],
      },
      shot: {
        title: 'Set up sla met',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-pivot-tickets-weekday-hour',
      table: 'dash_demo.support_tickets',
      grid: { x: 0, y: 4, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT CAST(isodow(t.opened_ts) AS VARCHAR) || ' ' || strftime(t.opened_ts, '%a') AS weekday,
       lpad(CAST(hour(t.opened_ts) AS VARCHAR), 2, '0') AS hour_of_day,
       count(*) AS tickets
FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for tickets weekday hour',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'pivot',
      shot: {
        title: 'Show tickets weekday hour as pivot',
        caption: 'Under **Visualize as**, choose **pivot**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'pivot',
      config: {},
      dsl: `pivotTable {
  rows([
    'weekday'
  ])
  cols([
    'hour_of_day'
  ])
  vals([
    'tickets'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals true
  colTotals false
}
`,
      shot: {
        title: 'Set up tickets weekday hour',
        caption: 'On the **Display** tab, set the pivot\'s rows, columns and values (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-chart-created-vs-resolved-per-week',
      table: 'dash_demo.support_tickets',
      grid: { x: 0, y: 9, w: 8, h: 4 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT week,
       sum(created) AS created,
       sum(resolved) AS resolved
FROM (
  SELECT date_trunc('week', t.opened_ts)::DATE AS week, 1 AS created, 0 AS resolved
  FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
    AND t.opened_ts >= (SELECT date_trunc('week', min(t2.opened_ts)) + INTERVAL 7 DAY FROM dash_demo.support_tickets t2)
    AND t.opened_ts < date_trunc('week', (SELECT a.as_of FROM dash_demo.as_of a))
  UNION ALL
  SELECT date_trunc('week', t.resolved_ts)::DATE AS week, 0 AS created, 1 AS resolved
  FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
    AND t.resolved_ts IS NOT NULL
    AND t.resolved_ts >= (SELECT date_trunc('week', min(t2.opened_ts)) + INTERVAL 7 DAY FROM dash_demo.support_tickets t2)
    AND t.resolved_ts < date_trunc('week', (SELECT a.as_of FROM dash_demo.as_of a))
)
GROUP BY week
ORDER BY week`,
      shot: {
        title: 'The query for created vs resolved per week',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show created vs resolved per week as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'line',
          data: {
            labelField: 'week',
            datasets: [{ field: 'created', label: 'Created' }, { field: 'resolved', label: 'Resolved' }],
          },
          options: { plugins: { title: { display: true, text: 'Created vs resolved per week' } } },
        },
      },
      dsl: `chart {
  type 'line'
  data {
    labelField 'week'
    datasets {
      dataset {
        field 'created'
        label 'Created'
      }
      dataset {
        field 'resolved'
        label 'Resolved'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Created vs resolved per week'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up created vs resolved per week',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-chart-open-backlog-by-priority',
      table: 'dash_demo.as_of',
      grid: { x: 8, y: 9, w: 4, h: 4 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT CASE WHEN date_diff('day', t.opened_ts, (SELECT a.as_of FROM dash_demo.as_of a)) <= 2 THEN '1 up to 2 days'
            WHEN date_diff('day', t.opened_ts, (SELECT a.as_of FROM dash_demo.as_of a)) <= 7 THEN '2 3 to 7 days'
            WHEN date_diff('day', t.opened_ts, (SELECT a.as_of FROM dash_demo.as_of a)) <= 30 THEN '3 8 to 30 days'
            ELSE '4 over 30 days' END AS age_band,
       t.priority AS priority,
       count(*) AS open_tickets
FROM dash_demo.support_tickets t
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
  AND t.status IN ('open', 'pending')
GROUP BY 1, 2
ORDER BY 1, 2`,
      shot: {
        title: 'The query for open backlog by priority',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show open backlog by priority as chart',
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
            labelField: 'age_band',
            seriesField: 'priority',
            datasets: [{ field: 'open_tickets', label: 'Open tickets' }],
          },
          options: {
            plugins: { title: { display: true, text: 'Open backlog by priority' } },
            scales: { x: { stacked: true }, y: { stacked: true } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'age_band'
    seriesField 'priority'
    datasets {
      dataset {
        field 'open_tickets'
        label 'Open tickets'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Open backlog by priority'
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
        title: 'Set up open backlog by priority',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd21-table-open-urgent-and-high',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 13, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT t.ticket_id AS ticket_id,
       t.priority AS priority,
       t.status AS status,
       t.channel AS channel,
       t.category AS category,
       sa.name AS agent,
       t.opened_ts::DATE AS opened_date,
       date_diff('day', t.opened_ts, (SELECT a.as_of FROM dash_demo.as_of a)) AS days_waiting
FROM dash_demo.support_tickets t
LEFT JOIN dash_demo.support_agents sa ON sa.agent_id = t.agent_id
WHERE true
  AND t.priority IN (\${priority})
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
  AND t.status IN ('open', 'pending')
  AND t.priority IN ('urgent', 'high')
ORDER BY days_waiting DESC, t.ticket_id`,
      shot: {
        title: 'The query for open urgent and high',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show open urgent and high as tabulator',
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
          ticket_id: { columnTitle: 'Ticket' },
          opened_date: { columnTitle: 'Opened' },
          days_waiting: { columnTitle: 'Days waiting' },
        },
      },
      shot: {
        title: 'Set up open urgent and high',
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
        { x: 0, y: 4, w: 12, h: 5 },
        { x: 0, y: 9, w: 8, h: 4 },
        { x: 8, y: 9, w: 4, h: 4 },
        { x: 0, y: 13, w: 12, h: 5 },
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

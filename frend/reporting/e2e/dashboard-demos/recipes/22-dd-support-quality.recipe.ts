// Dashboard Demo 22, Support Quality & Agents: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-support-quality, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-support-quality',
  nn: 22,
  title: 'Support Quality & Agents',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'team', type: 'String', label: 'Team') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \\'\\' AS value, \\'-- All teams --\\' AS label UNION ALL SELECT DISTINCT sa.team AS value, sa.team AS label FROM dash_demo.support_agents sa ORDER BY label')
  }
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 11 months, startOf month}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Team, From, To).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd22-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Support Quality & Agents

Chat leaves people happiest and no faster: CSAT 4.4 on chat against 4.07 on the phone, 3.83 by email and 3.67 on the web form, while a ticket takes 60 to 63 hours to resolve whichever channel it arrives on - chat's median, 62.63 hours, is the longest of the four against the web form's 60.28. So chat buys satisfaction, not speed. Every team clears the 90% SLA target, from 90.5% in Billing to 91.5% in Technical, and the 32 agents sit between 3.86 and 4.13 CSAT, so there is no one to single out for coaching.

Quality over time first - CSAT month by month, the SLA against its target from \`kpi_targets\`, and how often a ticket comes back - then the two sides of a channel's service, how fast it resolves and how happy it leaves people, and last the agents themselves. **Click the CSAT column** to sort the leaderboard by satisfaction instead of volume. The boxplot counts resolved tickets only: an open ticket has no resolution time. The window defaults to the last 12 months, the monthly review's own year.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd22-trend-csat',
      table: 'dash_demo.support_tickets',
      grid: { x: 0, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT date_trunc('month', t.opened_ts)::DATE AS month,
       round(avg(t.csat_score), 2) AS avg_csat
FROM dash_demo.support_tickets t
WHERE true
  AND t.opened_ts >= \${dateFrom}
  AND t.opened_ts < \${dateTo__next_day}
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
GROUP BY month
ORDER BY month`,
      shot: {
        title: 'The query for csat',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: { title: 'Show csat as trend', caption: 'Under **Visualize as**, choose **trend**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: { dateField: 'month', valueField: 'avg_csat', format: 'number', label: 'CSAT per month' },
      shot: {
        title: 'Set up csat',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd22-progress-team-sla',
      table: 'dash_demo.kpi_targets',
      grid: { x: 4, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on kpi_targets',
        caption: 'In the schema browser, pick **kpi_targets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(count(CASE WHEN NOT t.sla_breached THEN 1 END) / count(*)::DOUBLE
             * 100.0 / (SELECT k.target FROM dash_demo.kpi_targets k WHERE k.area = 'Support' AND k.kpi = 'sla_met'), 4) AS pct_of_target
FROM dash_demo.support_tickets t
WHERE true
  AND t.opened_ts >= \${dateFrom}
  AND t.opened_ts < \${dateTo__next_day}
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})`,
      shot: {
        title: 'The query for team sla',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: {
        title: 'Show team sla as progress',
        caption: 'Under **Visualize as**, choose **progress**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'Team SLA vs target', format: 'percent' },
      shot: {
        title: 'Set up team sla',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd22-kpi-reopened',
      table: 'dash_demo.support_tickets',
      grid: { x: 8, y: 1, w: 4, h: 3 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(count(CASE WHEN t.reopened THEN 1 END) / count(*)::DOUBLE, 4) AS reopened_rate
FROM dash_demo.support_tickets t
WHERE true
  AND t.opened_ts >= \${dateFrom}
  AND t.opened_ts < \${dateTo__next_day}
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})`,
      shot: {
        title: 'The query for reopened',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show reopened as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'reopened_rate', numberLabel: 'Reopened %', numberFormat: 'percent' },
      shot: {
        title: 'Set up reopened',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd22-chart-boxplot-resolution-hours-by-channel',
      table: 'dash_demo.support_tickets',
      grid: { x: 0, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT t.channel AS channel,
       round(date_diff('minute', t.opened_ts, t.resolved_ts) / 60.0, 2) AS resolution_hours
FROM dash_demo.support_tickets t
WHERE true
  AND t.opened_ts >= \${dateFrom}
  AND t.opened_ts < \${dateTo__next_day}
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
  AND t.resolved_ts IS NOT NULL
ORDER BY t.channel, resolution_hours`,
      shot: {
        title: 'The query for boxplot resolution hours by channel',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show boxplot resolution hours by channel as chart',
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
            labelField: 'channel',
            datasets: [{ field: 'resolution_hours', label: 'Hours to resolve' }],
          },
          options: { plugins: { title: { display: true, text: 'Resolution hours by channel' } } },
        },
      },
      dsl: `chart {
  type 'boxplot'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'resolution_hours'
        label 'Hours to resolve'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Resolution hours by channel'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up boxplot resolution hours by channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickCube',
      key: 'w-dd22-chart-csat-by-channel',
      cubeId: 'dd-support',
      grid: { x: 6, y: 4, w: 6, h: 4 },
      shot: {
        title: 'Pick the dd-support cube',
        caption: 'In the schema browser, pick the cube **dd-support**.',
      },
    },
    {
      kind: 'cubeFields',
      cube: {
        dimensions: ['Channel'],
        measures: ['AvgCsat'],
        filters: [{ member: 'OpenedAt', operator: 'lt', values: ['${dateTo__next_day}'] }],
        order: [{ member: 'AvgCsat', dir: 'desc' }],
        bindings: [
          { param: 'team', member: 'Team', operator: 'equals' },
          { param: 'dateFrom', member: 'OpenedAt', operator: 'greater_or_equal' },
        ],
      },
      shot: { title: 'Tick the fields of csat by channel', caption: 'Tick **Channel, AvgCsat**.' },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show csat by channel as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: { labelField: 'Channel', datasets: [{ field: 'AvgCsat', label: 'CSAT' }] },
          options: {
            plugins: { title: { display: true, text: 'CSAT by channel' }, legend: { display: false } },
            scales: { y: { suggestedMin: 3, suggestedMax: 5 } },
          },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'Channel'
    datasets {
      dataset {
        field 'AvgCsat'
        label 'CSAT'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'CSAT by channel'
      }
      legend {
        display false
      }
    }
    scales {
      y {
        suggestedMin 3
        suggestedMax 5
      }
    }
  }
}
`,
      shot: {
        title: 'Set up csat by channel',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd22-table-agent-leaderboard',
      table: 'dash_demo.support_tickets',
      grid: { x: 0, y: 8, w: 12, h: 5 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT sa.name AS agent,
       sa.team AS team,
       count(*) AS tickets,
       round(avg(date_diff('minute', t.opened_ts, t.resolved_ts) / 60.0), 2) AS avg_resolution_hours,
       round(avg(t.csat_score), 2) AS avg_csat,
       round(100.0 * count(CASE WHEN NOT t.sla_breached THEN 1 END) / count(*), 2) AS sla_met_pct
FROM dash_demo.support_tickets t
JOIN dash_demo.support_agents sa ON sa.agent_id = t.agent_id
WHERE true
  AND t.opened_ts >= \${dateFrom}
  AND t.opened_ts < \${dateTo__next_day}
  AND t.agent_id IN (SELECT sa.agent_id FROM dash_demo.support_agents sa WHERE sa.team = \${team})
GROUP BY sa.name, sa.team
ORDER BY tickets DESC, agent`,
      shot: {
        title: 'The query for agent leaderboard',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show agent leaderboard as tabulator',
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
          theme: 'bulma',
        },
        columnSettings: {
          agent: { columnTitle: 'Agent' },
          team: { columnTitle: 'Team' },
          tickets: { columnTitle: 'Tickets' },
          avg_resolution_hours: { columnTitle: 'Average resolution, hours' },
          avg_csat: { columnTitle: 'CSAT' },
          sla_met_pct: { columnTitle: 'SLA met %' },
        },
      },
      shot: {
        title: 'Set up agent leaderboard',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 4, h: 3 },
        { x: 4, y: 1, w: 4, h: 3 },
        { x: 8, y: 1, w: 4, h: 3 },
        { x: 0, y: 4, w: 6, h: 4 },
        { x: 6, y: 4, w: 6, h: 4 },
        { x: 0, y: 8, w: 12, h: 5 },
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

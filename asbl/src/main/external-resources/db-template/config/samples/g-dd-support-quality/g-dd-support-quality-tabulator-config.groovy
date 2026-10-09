tabulator('tabulator_dd22-table-agent-leaderboard') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 10
  theme 'bulma'
  autoColumnsDefinitions([
    [
      field: 'agent',
      title: 'Agent'
    ],
    [
      field: 'team',
      title: 'Team'
    ],
    [
      field: 'tickets',
      title: 'Tickets'
    ],
    [
      field: 'avg_resolution_hours',
      title: 'Average resolution, hours'
    ],
    [
      field: 'avg_csat',
      title: 'CSAT'
    ],
    [
      field: 'sla_met_pct',
      title: 'SLA met %'
    ]
  ])
}

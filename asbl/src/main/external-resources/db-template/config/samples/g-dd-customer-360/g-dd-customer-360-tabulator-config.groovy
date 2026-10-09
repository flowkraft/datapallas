tabulator('tabulator_dd11-table-last-20-orders') {
  layout 'fitColumns'
  autoColumns true
  autoColumnsDefinitions([
    [
      field: 'total_amount',
      title: 'Total'
    ]
  ])
}


tabulator('tabulator_dd11-table-tickets') {
  layout 'fitColumns'
  autoColumns true
  autoColumnsDefinitions([
    [
      field: 'sla_breached',
      title: 'SLA breached'
    ],
    [
      field: 'csat',
      title: 'CSAT'
    ]
  ])
}

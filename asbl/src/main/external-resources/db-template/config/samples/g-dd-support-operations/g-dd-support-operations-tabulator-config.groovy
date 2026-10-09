tabulator('tabulator_dd21-table-open-urgent-and-high') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 10
  theme 'bootstrap5'
  autoColumnsDefinitions([
    [
      field: 'ticket_id',
      title: 'Ticket'
    ],
    [
      field: 'opened_date',
      title: 'Opened'
    ],
    [
      field: 'days_waiting',
      title: 'Days waiting'
    ]
  ])
}

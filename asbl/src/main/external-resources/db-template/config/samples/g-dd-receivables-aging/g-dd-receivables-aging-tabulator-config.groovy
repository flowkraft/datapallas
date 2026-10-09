tabulator('tabulator_dd14-table-overdue-invoices') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 12
  theme 'midnight'
  autoColumnsDefinitions([
    [
      field: 'invoice_no',
      title: 'Invoice'
    ],
    [
      field: 'days_overdue',
      title: 'Days overdue'
    ],
    [
      field: 'owed',
      title: 'Owed'
    ]
  ])
}

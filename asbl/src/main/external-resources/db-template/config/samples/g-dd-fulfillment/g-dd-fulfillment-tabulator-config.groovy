tabulator('tabulator_dd20-table-late-orders') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 10
  theme 'modern'
  autoColumnsDefinitions([
    [
      field: 'order_id',
      title: 'Order'
    ],
    [
      field: 'promised_date',
      title: 'Promised'
    ],
    [
      field: 'delivered_date',
      title: 'Delivered'
    ],
    [
      field: 'days_late',
      title: 'Days late'
    ]
  ])
}

tabulator('tabulator_invoices_invoices') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 12
  theme 'simple'
  autoColumnsDefinitions([
    [
      field: 'invoice_no',
      title: 'Invoice'
    ],
    [
      field: 'issue_date',
      title: 'Issued'
    ],
    [
      field: 'due_date',
      title: 'Due'
    ],
    [
      field: 'tax_amount',
      title: 'Tax'
    ]
  ])
}

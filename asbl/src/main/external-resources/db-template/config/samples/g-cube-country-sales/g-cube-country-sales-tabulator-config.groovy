tabulator('tabulator_net-category') {
  layout 'fitColumns'
  autoColumns true
  autoColumnsDefinitions([
    [
      field: 'NetSales',
      formatter: 'money',
      formatterParams: [
        symbol: '€',
        thousand: ',',
        decimal: '.',
        precision: 2
      ],
      hozAlign: 'right',
      headerHozAlign: 'right'
    ]
  ])
}


tabulator('tabulator_live-shop') {
  layout 'fitColumns'
  autoColumns true
  autoColumnsDefinitions([
    [
      field: 'NetSales',
      formatter: 'money',
      formatterParams: [
        symbol: '€',
        thousand: ',',
        decimal: '.',
        precision: 2
      ],
      hozAlign: 'right',
      headerHozAlign: 'right'
    ]
  ])
}

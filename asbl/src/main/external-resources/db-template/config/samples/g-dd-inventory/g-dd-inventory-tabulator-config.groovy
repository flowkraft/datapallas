tabulator('tabulator_dd19-table-stock-by-sku') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 10
  theme 'bootstrap5'
  autoColumnsDefinitions([
    [
      field: 'sku',
      title: 'SKU'
    ],
    [
      field: 'product',
      title: 'Product'
    ],
    [
      field: 'qty_on_hand',
      title: 'On hand'
    ],
    [
      field: 'reorder_level',
      title: 'Reorder level'
    ],
    [
      field: 'suggested_order',
      title: 'Suggested order'
    ]
  ])
}

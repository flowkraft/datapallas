tabulator('tabulator_products_products') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 25
  theme 'modern'
  autoColumnsDefinitions([
    [
      field: 'product_id',
      visible: false
    ],
    [
      field: 'subcategory',
      visible: false
    ]
  ])
}

pivotTable('pivot_dd16-pivot-margin-by-category-quarter') {
  rows([
    'Category'
  ])
  cols([
    'OrderedAt'
  ])
  vals([
    'MarginPct'
  ])
  aggregatorName 'Average'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}

pivotTable('pivot_dd08-pivot-variance-by-region-month') {
  rows([
    'region'
  ])
  cols([
    'month'
  ])
  vals([
    'variance_pct'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}

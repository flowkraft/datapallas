pivotTable('pivot_dd06-pivot-weekday-hour') {
  rows([
    'weekday'
  ])
  cols([
    'hour_of_day'
  ])
  vals([
    'orders'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}

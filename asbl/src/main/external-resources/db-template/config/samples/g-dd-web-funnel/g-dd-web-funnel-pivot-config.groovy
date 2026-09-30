pivotTable('pivot_dd12-pivot-sessions-weekday-hour') {
  rows([
    'weekday'
  ])
  cols([
    'hour_of_day'
  ])
  vals([
    'sessions'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals true
  colTotals false
}

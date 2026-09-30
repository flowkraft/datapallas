pivotTable('pivot_dd21-pivot-tickets-weekday-hour') {
  rows([
    'weekday'
  ])
  cols([
    'hour_of_day'
  ])
  vals([
    'tickets'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals true
  colTotals false
}

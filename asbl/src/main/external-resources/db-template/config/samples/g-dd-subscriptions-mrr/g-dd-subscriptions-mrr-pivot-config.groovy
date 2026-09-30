pivotTable('pivot_dd15-pivot-subscriber-cohorts') {
  rows([
    'cohort'
  ])
  cols([
    'month'
  ])
  vals([
    'retained_pct'
  ])
  aggregatorName 'Average'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}

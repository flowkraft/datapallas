pivotTable('pivot_dd10-pivot-cohorts') {
  rows([
    'cohort'
  ])
  cols([
    'periods_since_signup'
  ])
  vals([
    'retention_pct'
  ])
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  rowTotals false
  colTotals false
}

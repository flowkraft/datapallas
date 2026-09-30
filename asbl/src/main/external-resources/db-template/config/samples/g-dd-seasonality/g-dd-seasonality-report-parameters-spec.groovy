reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All channels --\' AS label UNION ALL SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label')
  }
}

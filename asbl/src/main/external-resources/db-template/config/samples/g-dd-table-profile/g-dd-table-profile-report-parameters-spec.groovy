reportParameters {
  parameter(id: 'tableName', type: 'String', label: 'Table', defaultValue: 'support_tickets') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT table_name AS value, table_name AS label FROM information_schema.tables WHERE table_schema = \'dash_demo\' ORDER BY label')
  }
  parameter(id: 'columnName', type: 'String', label: 'Column', defaultValue: 'priority') {
    constraints(required: true)
    ui(control: 'text')
  }
}

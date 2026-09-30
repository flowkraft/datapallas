reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 7 quarter, startOf quarter}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'category', type: 'String', label: 'Category') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All categories --\' AS label UNION ALL SELECT DISTINCT p.category AS value, p.category AS label FROM dash_demo.products p ORDER BY label')
  }
}

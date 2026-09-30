reportParameters {
  parameter(id: 'category', type: 'String', label: 'Category') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All categories --\' AS label UNION ALL SELECT DISTINCT category AS value, category AS label FROM dash_demo.products ORDER BY label')
  }
  parameter(id: 'topN', type: 'Integer', label: 'How many', defaultValue: 10) {
    constraints(required: true)
    ui(control: 'select', options: [[value: 5, label: '5'], [value: 10, label: '10'], [value: 25, label: '25']])
  }
}

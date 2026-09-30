reportParameters {
  parameter(id: 'customerType', type: 'String', label: 'Customer type', defaultValue: 'all') {
    constraints(required: true)
    ui(control: 'radio', options: 'SELECT \'all\' AS value, \'All\' AS label UNION ALL SELECT DISTINCT customer_type AS value, customer_type AS label FROM dash_demo.customers ORDER BY label')
  }
}

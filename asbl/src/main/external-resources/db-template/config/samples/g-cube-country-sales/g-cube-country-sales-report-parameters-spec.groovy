reportParameters {
  parameter(id: 'country', type: 'String', label: 'Country', defaultValue: '*') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'*\' AS value, \'All countries\' AS label UNION ALL SELECT DISTINCT country AS value, country AS label FROM cube_demo.shop_customers WHERE country IS NOT NULL ORDER BY 1')
  }
}

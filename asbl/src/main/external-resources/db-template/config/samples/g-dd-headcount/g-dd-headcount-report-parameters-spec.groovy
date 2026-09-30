reportParameters {
  parameter(id: 'department', type: 'String', label: 'Department') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All departments --\' AS label UNION ALL SELECT d.name AS value, d.name AS label FROM dash_demo.departments d ORDER BY label')
  }
  parameter(id: 'country', type: 'String', label: 'Country') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All countries --\' AS label UNION ALL SELECT DISTINCT g.country AS value, g.country AS label FROM dash_demo.employees e JOIN dash_demo.geo_cities g ON g.city_id = e.city_id ORDER BY label')
  }
}

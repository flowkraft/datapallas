reportParameters {
  parameter(id: 'region', type: 'String', label: 'Region') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \'\' AS value, \'-- All regions --\' AS label UNION ALL SELECT DISTINCT region AS value, region AS label FROM dash_demo.geo_cities ORDER BY label')
  }
  parameter(id: 'countries', type: 'String', label: 'Countries', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT country AS value, country AS label FROM dash_demo.geo_cities ORDER BY label')
  }
}

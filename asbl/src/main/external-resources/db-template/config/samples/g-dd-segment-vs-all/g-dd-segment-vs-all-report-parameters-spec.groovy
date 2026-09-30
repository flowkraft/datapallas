reportParameters {
  parameter(id: 'country', type: 'String', label: 'Country', defaultValue: 'Poland') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT g.country AS value, g.country AS label FROM dash_demo.orders o JOIN dash_demo.geo_cities g ON g.city_id = o.city_id GROUP BY g.country HAVING count(*) >= 400 ORDER BY label')
  }
}

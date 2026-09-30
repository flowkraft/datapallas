reportParameters {
  parameter(id: 'year', type: 'Date', label: 'Year', defaultValue: '{dataToday:startOf year}') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT CAST(date_trunc(\'year\', month) AS VARCHAR) AS value, CAST(year(month) AS VARCHAR) AS label FROM dash_demo.sales_targets ORDER BY value DESC')
  }
  parameter(id: 'region', type: 'String', label: 'Region') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \'\' AS value, \'-- All regions --\' AS label UNION ALL SELECT DISTINCT region AS value, region AS label FROM dash_demo.sales_targets ORDER BY label')
  }
}

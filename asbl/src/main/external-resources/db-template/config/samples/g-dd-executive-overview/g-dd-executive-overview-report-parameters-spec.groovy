reportParameters {
  parameter(id: 'year', type: 'Date', label: 'Year', defaultValue: '{dataToday:startOf year}') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT CAST(date_trunc(\'year\', order_ts) AS VARCHAR) AS value, CAST(year(order_ts) AS VARCHAR) AS label FROM dash_demo.orders ORDER BY value DESC')
  }
}

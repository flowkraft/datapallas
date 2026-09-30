reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 1 year, startOf year}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'country', type: 'String', label: 'Country') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All countries --\' AS label UNION ALL SELECT DISTINCT country_code AS value, country AS label FROM dash_demo.geo_cities ORDER BY label')
  }
  parameter(id: 'channel', type: 'String', label: 'Channel', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label')
  }
}

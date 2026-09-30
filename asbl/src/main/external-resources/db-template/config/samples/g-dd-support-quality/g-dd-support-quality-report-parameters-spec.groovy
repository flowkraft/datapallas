reportParameters {
  parameter(id: 'team', type: 'String', label: 'Team') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT \'\' AS value, \'-- All teams --\' AS label UNION ALL SELECT DISTINCT sa.team AS value, sa.team AS label FROM dash_demo.support_agents sa ORDER BY label')
  }
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 11 months, startOf month}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
}

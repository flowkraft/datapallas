reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'From', defaultValue: '{dataToday:minus 11 months, startOf month}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'device', type: 'String', label: 'Device', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT device AS value, device AS label FROM dash_demo.web_sessions ORDER BY label')
  }
}

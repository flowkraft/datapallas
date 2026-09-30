reportParameters {
  parameter(id: 'repEmployeeId', type: 'String', label: 'Rep') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All reps --\' AS label UNION ALL SELECT DISTINCT e.employee_id::VARCHAR AS value, e.name AS label FROM dash_demo.rep_quotas q JOIN dash_demo.employees e ON e.employee_id = q.employee_id ORDER BY label')
  }
  parameter(id: 'closeFrom', type: 'Date', label: 'Closing from', defaultValue: '{dataToday:startOf quarter}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'closeTo', type: 'Date', label: 'Closing to', defaultValue: '{dataToday:endOf quarter}') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
}

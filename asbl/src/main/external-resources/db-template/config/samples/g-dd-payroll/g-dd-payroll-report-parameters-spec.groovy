reportParameters {
  parameter(id: 'period', type: 'String', label: 'Period', defaultValue: '2026-09') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT strftime(pl.period_month, \'%Y-%m\') AS value, strftime(pl.period_month, \'%Y-%m\') AS label FROM dash_demo.payroll_lines pl ORDER BY value DESC')
  }
  parameter(id: 'department', type: 'String', label: 'Department', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT d.name AS value, d.name AS label FROM dash_demo.departments d ORDER BY d.name')
  }
}

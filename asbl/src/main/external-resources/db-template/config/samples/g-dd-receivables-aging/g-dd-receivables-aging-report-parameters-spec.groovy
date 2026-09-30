reportParameters {
  parameter(id: 'minAmount', type: 'Double', label: 'Minimum amount', defaultValue: 0) {
    constraints(required: true)
    ui(control: 'text')
  }
  parameter(id: 'accountManagerId', type: 'Integer', label: 'Account manager') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All managers --\' AS label UNION ALL SELECT CAST(e.employee_id AS VARCHAR) AS value, e.name AS label FROM dash_demo.employees e WHERE EXISTS (SELECT 1 FROM dash_demo.customers c WHERE c.account_manager_id = e.employee_id) ORDER BY label')
  }
}

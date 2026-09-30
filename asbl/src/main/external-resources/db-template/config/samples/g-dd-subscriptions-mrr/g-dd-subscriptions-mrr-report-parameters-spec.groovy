reportParameters {
  parameter(id: 'plan', type: 'String', label: 'Plan', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT s.plan AS value, s.plan AS label FROM dash_demo.subscriptions s ORDER BY label')
  }
}

reportParameters {
  parameter(id: 'priority', type: 'String', label: 'Priority', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: [[value: 'urgent', label: 'Urgent'], [value: 'high', label: 'High'], [value: 'normal', label: 'Normal'], [value: 'low', label: 'Low']])
  }
  parameter(id: 'team', type: 'String', label: 'Team') {
    constraints(required: false)
    ui(control: 'select', options: [[value: '', label: '-- All teams --'], [value: 'Tier 1', label: 'Tier 1'], [value: 'Technical', label: 'Technical'], [value: 'Billing', label: 'Billing'], [value: 'Returns', label: 'Returns']])
  }
}

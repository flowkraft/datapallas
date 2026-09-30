reportParameters {
  parameter(id: 'metric', type: 'String', label: 'Metric', defaultValue: 'Revenue') {
    constraints(required: true, allowedValues: ['Revenue', 'Orders', 'New customers', 'Tickets', 'Payroll cost'])
    ui(control: 'radio')
  }
}

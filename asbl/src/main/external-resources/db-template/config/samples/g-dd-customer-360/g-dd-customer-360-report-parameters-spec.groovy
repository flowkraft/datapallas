reportParameters {
  parameter(id: 'customerId', type: 'Integer', label: 'Customer', defaultValue: 1017) {
    constraints(required: true)
    ui(control: 'select', searchable: true, options: 'SELECT c.customer_id AS value, c.name AS label FROM dash_demo.customers c ORDER BY c.name, c.customer_id')
  }
}

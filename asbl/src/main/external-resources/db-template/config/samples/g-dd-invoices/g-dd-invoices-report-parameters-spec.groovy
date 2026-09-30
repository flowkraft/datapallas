reportParameters {
  parameter(id: 'status', type: 'String', label: 'Status', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT status AS value, status AS label FROM dash_demo.invoices ORDER BY label')
  }
  parameter(id: 'customerId', type: 'Integer', label: 'Customer') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All customers --\' AS label UNION ALL SELECT CAST(c.customer_id AS VARCHAR) AS value, c.name AS label FROM dash_demo.customers c WHERE EXISTS (SELECT 1 FROM dash_demo.invoices i WHERE i.customer_id = c.customer_id) ORDER BY label')
  }
  parameter(id: 'issuedFrom', type: 'Date', label: 'Issued from', defaultValue: '{dataToday:startOf year}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
  parameter(id: 'issuedTo', type: 'Date', label: 'Issued to', defaultValue: '{dataToday}') {
    constraints(required: true)
    ui(control: 'datepicker')
  }
}

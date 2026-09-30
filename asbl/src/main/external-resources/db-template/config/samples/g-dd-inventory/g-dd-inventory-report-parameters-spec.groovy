reportParameters {
  parameter(id: 'warehouse', type: 'String', label: 'Warehouse') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \'\' AS value, \'-- All warehouses --\' AS label UNION ALL SELECT w.name AS value, w.name AS label FROM dash_demo.warehouses w ORDER BY label')
  }
  parameter(id: 'belowReorderOnly', type: 'Boolean', label: 'Below reorder level only', defaultValue: true) {
    constraints(required: false)
    ui(control: 'checkbox')
  }
  parameter(id: 'category', type: 'String', label: 'Category', defaultValue: []) {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT pr.category AS value, pr.category AS label FROM dash_demo.products pr ORDER BY label')
  }
}

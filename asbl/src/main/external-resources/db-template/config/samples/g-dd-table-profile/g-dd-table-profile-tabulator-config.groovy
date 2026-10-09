tabulator('tabulator_dd23-table-column-profile') {
  layout 'fitColumns'
  autoColumns true
  pagination true
  paginationSize 10
  theme 'modern'
  autoColumnsDefinitions([
    [
      field: 'column_name',
      title: 'Column'
    ],
    [
      field: 'column_type',
      title: 'Type'
    ],
    [
      field: 'role_guessed_from_the_name',
      title: 'Role, guessed'
    ],
    [
      field: 'null_percentage',
      title: 'Nulls %'
    ],
    [
      field: 'distinct_values_approx',
      title: 'Distinct, approximate'
    ],
    [
      field: 'smallest',
      title: 'Min'
    ],
    [
      field: 'average',
      title: 'Average'
    ],
    [
      field: 'largest',
      title: 'Max'
    ]
  ])
}

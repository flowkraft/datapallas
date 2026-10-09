tabulator('tabulator_dd17-table-cost-change-by-department') {
  layout 'fitColumns'
  autoColumns true
  pagination false
  theme 'midnight'
  autoColumnsDefinitions([
    [
      field: 'department',
      title: 'Department'
    ],
    [
      field: 'people_change',
      title: 'People'
    ],
    [
      field: 'cost_change',
      title: 'Cost change'
    ],
    [
      field: 'from_more_people',
      title: 'From more people'
    ],
    [
      field: 'from_higher_pay',
      title: 'From higher pay'
    ]
  ])
}

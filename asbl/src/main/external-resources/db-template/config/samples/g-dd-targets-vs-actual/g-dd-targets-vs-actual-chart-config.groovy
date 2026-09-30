chart('chart_dd08-chart-monthly-revenue-vs-target') {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'actual'
        label 'Actual'
      }
      dataset {
        field 'revenue_target'
        label 'Target'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Monthly revenue vs target'
      }
    }
  }
}

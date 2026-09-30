chart('chart_dd01-chart-revenue-vs-target') {
  type 'bar'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        type 'bar'
      }
      dataset {
        field 'revenue_target'
        label 'Target'
        type 'line'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue actual vs target per month'
      }
    }
  }
}

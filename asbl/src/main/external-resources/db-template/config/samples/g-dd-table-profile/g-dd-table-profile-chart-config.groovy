chart('chart_dd23-chart-distribution') {
  type 'bar'
  data {
    labelField 'bucket'
    datasets {
      dataset {
        field 'rows_in_bucket'
        label 'Rows'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Distribution of the chosen column'
      }
      legend {
        display false
      }
    }
  }
}

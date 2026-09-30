chart('chart_dd10-chart-retention-curve') {
  type 'line'
  data {
    labelField 'month_since_signup'
    seriesField 'cohort_group'
    datasets {
      dataset {
        field 'retention_pct'
        label 'Still ordering %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Retention curve: the ten months either side of March 2025'
      }
    }
  }
}

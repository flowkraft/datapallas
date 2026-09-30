chart('chart_dd02-chart-revenue-per-month') {
  type 'line'
  data {
    labelField 'order_ts'
    datasets {
      dataset {
        field 'total_amount_sum'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue per month'
      }
    }
  }
}


chart('chart_dd02-chart-revenue-by-category') {
  type 'row'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue by category'
      }
    }
  }
}


chart('chart_dd02-chart-revenue-by-channel') {
  type 'row'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'total_amount_sum'
        label 'Revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue by channel'
      }
    }
  }
}

chart('chart_dd09-chart-new-customers-per-month-by-channel') {
  type 'line'
  data {
    labelField 'month'
    seriesField 'channel'
    datasets {
      dataset {
        field 'new_customers'
        label 'New customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'New customers per month by channel'
      }
    }
  }
}


chart('chart_dd09-chart-segment-mix') {
  type 'doughnut'
  data {
    labelField 'segment'
    datasets {
      dataset {
        field 'customer_id_count'
        label 'Customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Segment mix'
      }
    }
  }
}


chart('chart_dd09-chart-customers-by-lifetime-orders') {
  type 'bar'
  data {
    labelField 'lifetime_orders'
    datasets {
      dataset {
        field 'customers'
        label 'Customers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Customers by lifetime orders'
      }
      legend {
        display false
      }
    }
  }
}

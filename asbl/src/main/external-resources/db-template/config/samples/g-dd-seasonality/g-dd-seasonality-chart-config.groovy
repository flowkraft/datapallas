chart('chart_dd06-chart-orders-by-month-of-year') {
  type 'bar'
  data {
    labelField 'order_ts'
    datasets {
      dataset {
        field 'order_id_count'
        label 'Orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Orders by month of year'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd06-chart-average-by-day-of-month') {
  type 'bar'
  data {
    labelField 'day_of_month'
    datasets {
      dataset {
        field 'avg_orders'
        label 'Average orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Average orders per day, by day of month'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd06-chart-daily-orders-black-friday') {
  type 'line'
  data {
    labelField 'day'
    datasets {
      dataset {
        field 'orders'
        label 'Orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Daily orders around last year\'s Black Friday, 1 November - 15 December'
      }
      legend {
        display false
      }
    }
  }
}

chart('chart_dd20-chart-late-by-carrier') {
  type 'bar'
  data {
    labelField 'carrier'
    datasets {
      dataset {
        field 'late_pct'
        label 'Late %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Late % by carrier'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd20-chart-boxplot-delivery-days-by-carrier') {
  type 'boxplot'
  data {
    labelField 'carrier'
    datasets {
      dataset {
        field 'delivery_days'
        label 'Days to deliver'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Delivery days by carrier'
      }
    }
  }
}

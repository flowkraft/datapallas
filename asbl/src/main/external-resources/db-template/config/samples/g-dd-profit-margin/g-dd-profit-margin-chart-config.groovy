chart('chart_dd16-chart-revenue-and-margin-per-month') {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
      }
      dataset {
        field 'margin_pct'
        label 'Margin %'
        yAxisID 'y1'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue and margin % per month'
      }
    }
    scales {
      y {
        position 'left'
        title {
          display true
          text 'Revenue'
        }
      }
      y1 {
        position 'right'
        title {
          display true
          text 'Margin %'
        }
        grid {
          drawOnChartArea false
        }
      }
    }
  }
}


chart('chart_dd16-chart-waterfall-list-price-to-gross-profit') {
  type 'waterfall'
  data {
    labelField 'step'
    datasets {
      dataset {
        field 'amount'
        label 'From list price to gross profit'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'From list price to gross profit: discounts and cost of goods'
      }
    }
  }
}

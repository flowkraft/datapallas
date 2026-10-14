chart('chart_dd11-chart-orders-per-month') {
  type 'combo'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'orders'
        label 'Orders'
      }
      dataset {
        field 'revenue'
        label 'Revenue'
        yAxisID 'y1'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Orders per month'
      }
    }
    scales {
      y {
        position 'left'
        title {
          display true
          text 'Orders'
        }
      }
      y1 {
        position 'right'
        title {
          display true
          text 'Revenue'
        }
        grid {
          drawOnChartArea false
        }
      }
    }
  }
}


chart('chart_dd11-chart-spend-by-category') {
  type 'doughnut'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'spend'
        label 'Spend'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Spend by category'
      }
    }
  }
}

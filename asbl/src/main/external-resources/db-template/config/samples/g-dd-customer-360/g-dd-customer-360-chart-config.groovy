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

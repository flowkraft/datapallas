chart('chart_dd03-chart-average-order-value-by-country') {
  type 'row'
  data {
    labelField 'country'
    datasets {
      dataset {
        field 'average_order_value'
        label 'Average order'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Average order value by country, top 10'
      }
    }
  }
}

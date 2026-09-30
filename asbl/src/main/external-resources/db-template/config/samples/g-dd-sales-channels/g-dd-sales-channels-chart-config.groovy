chart('chart_dd04-chart-revenue-mix-by-channel') {
  type 'pie'
  data {
    labelField 'channel'
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
        text 'Revenue mix by channel'
      }
    }
  }
}


chart('chart_dd04-chart-average-order-value-per-channel') {
  type 'bar'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'avg_order_value'
        label 'Average order'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Average order value per channel'
      }
    }
  }
}


chart('chart_dd04-chart-channel-share-per-month') {
  type 'area'
  data {
    labelField 'month'
    seriesField 'channel'
    datasets {
      dataset {
        field 'share_pct'
        label 'Share of orders %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Channel share of orders per month'
      }
    }
  }
}

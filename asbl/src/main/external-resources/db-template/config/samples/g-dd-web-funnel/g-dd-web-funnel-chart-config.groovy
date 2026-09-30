chart('chart_dd12-chart-funnel') {
  type 'funnel'
  data {
    labelField 'step'
    datasets {
      dataset {
        field 'sessions'
        label 'Sessions (sampled 1 in 8)'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Session to product to cart to checkout to purchase'
      }
    }
  }
}


chart('chart_dd12-chart-sessions-per-week-by-device') {
  type 'line'
  data {
    labelField 'started_ts'
    seriesField 'device'
    datasets {
      dataset {
        field 'session_id_count'
        label 'Sessions'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Sessions per week by device (sampled 1 in 8)'
      }
    }
  }
}


chart('chart_dd12-chart-mobile-checkout-per-month') {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'checkout_to_purchase_pct'
        label 'Checkout to purchase %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Checkout to purchase % per month - filter to mobile for the June story'
      }
    }
    legend {
      display false
    }
  }
}


chart('chart_dd12-chart-conversion-by-traffic-source') {
  type 'bar'
  data {
    labelField 'traffic_source'
    datasets {
      dataset {
        field 'conversion_pct'
        label 'Conversion %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Conversion rate by traffic source'
      }
      legend {
        display false
      }
    }
  }
}

chart('chart_dd15-chart-waterfall-mrr-movement') {
  type 'waterfall'
  data {
    labelField 'movement'
    datasets {
      dataset {
        field 'mrr_delta'
        label 'MRR movement'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'MRR movement over the last 12 months'
      }
    }
  }
}


chart('chart_dd15-chart-churn-reasons') {
  type 'bar'
  data {
    labelField 'cancel_reason'
    datasets {
      dataset {
        field 'subscription_id_count'
        label 'Subscribers'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Churn reasons'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd15-chart-mrr-by-plan') {
  type 'area'
  data {
    labelField 'month'
    seriesField 'plan'
    datasets {
      dataset {
        field 'mrr'
        label 'MRR'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'MRR by plan'
      }
    }
  }
}

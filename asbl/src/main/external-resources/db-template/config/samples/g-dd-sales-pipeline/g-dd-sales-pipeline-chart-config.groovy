chart('chart_dd07-chart-deals-by-stage') {
  type 'funnel'
  data {
    labelField 'stage'
    datasets {
      dataset {
        field 'deals'
        label 'Deals'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Open deals by stage'
      }
    }
  }
}


chart('chart_dd07-chart-win-rate-by-lead-source') {
  type 'bar'
  data {
    labelField 'lead_source'
    datasets {
      dataset {
        field 'win_rate_pct'
        label 'Win rate %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Win rate by lead source'
      }
      legend {
        display false
      }
    }
  }
}

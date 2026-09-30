chart('chart_dd13-chart-billed-per-month-by-status') {
  type 'bar'
  data {
    labelField 'IssuedAt'
    seriesField 'Status'
    datasets {
      dataset {
        field 'Billed'
        label 'Billed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Billed per month by status'
      }
    }
    scales {
      x {
        stacked true
      }
      y {
        stacked true
      }
    }
  }
}


chart('chart_dd13-chart-billed-by-source') {
  type 'doughnut'
  data {
    labelField 'source'
    datasets {
      dataset {
        field 'billed_sum_pct'
        label 'Share of billing %'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Billed by source: trade orders vs Care plans'
      }
    }
  }
}


chart('chart_dd13-chart-top-10-customers-by-billed') {
  type 'row'
  data {
    labelField 'Customer'
    datasets {
      dataset {
        field 'Billed'
        label 'Billed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Top 10 customers by billed amount'
      }
      legend {
        display false
      }
    }
  }
}

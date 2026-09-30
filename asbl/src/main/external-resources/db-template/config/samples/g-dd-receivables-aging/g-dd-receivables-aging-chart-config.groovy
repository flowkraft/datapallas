chart('chart_dd14-chart-aging-buckets') {
  type 'bar'
  data {
    labelField 'bucket'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Aging buckets: current, 1-30, 31-60, 61-90, 90+'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd14-chart-aging-by-segment') {
  type 'bar'
  data {
    labelField 'bucket'
    seriesField 'segment'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Aging by segment'
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


chart('chart_dd14-chart-top-10-overdue-customers') {
  type 'row'
  data {
    labelField 'customer'
    datasets {
      dataset {
        field 'owed'
        label 'Owed'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Top 10 overdue customers'
      }
      legend {
        display false
      }
    }
  }
}

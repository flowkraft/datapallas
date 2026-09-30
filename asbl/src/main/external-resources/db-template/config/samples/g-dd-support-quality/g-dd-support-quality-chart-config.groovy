chart('chart_dd22-chart-boxplot-resolution-hours-by-channel') {
  type 'boxplot'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'resolution_hours'
        label 'Hours to resolve'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Resolution hours by channel'
      }
    }
  }
}


chart('chart_dd22-chart-csat-by-channel') {
  type 'bar'
  data {
    labelField 'Channel'
    datasets {
      dataset {
        field 'AvgCsat'
        label 'CSAT'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'CSAT by channel'
      }
      legend {
        display false
      }
    }
    scales {
      y {
        suggestedMin 3
        suggestedMax 5
      }
    }
  }
}

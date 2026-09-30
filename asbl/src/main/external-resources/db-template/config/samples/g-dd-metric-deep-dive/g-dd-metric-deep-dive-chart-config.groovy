chart('chart_dd24-chart-metric-over-time') {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'value'
        label 'Per month'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'The metric over time'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd24-chart-what-it-is-made-of') {
  type 'row'
  data {
    labelField 'made_of'
    datasets {
      dataset {
        field 'value'
        label 'Year to date'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'What it is made of'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd24-chart-by-month-of-year') {
  type 'bar'
  data {
    labelField 'month_of_year'
    datasets {
      dataset {
        field 'value'
        label 'All years together'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'By month of year'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd24-chart-by-country-top-10') {
  type 'row'
  data {
    labelField 'country'
    datasets {
      dataset {
        field 'value'
        label 'Year to date'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'By country, top 10'
      }
      legend {
        display false
      }
    }
  }
}

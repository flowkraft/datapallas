chart('chart_dd21-chart-created-vs-resolved-per-week') {
  type 'line'
  data {
    labelField 'week'
    datasets {
      dataset {
        field 'created'
        label 'Created'
      }
      dataset {
        field 'resolved'
        label 'Resolved'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Created vs resolved per week'
      }
    }
  }
}


chart('chart_dd21-chart-open-backlog-by-priority') {
  type 'bar'
  data {
    labelField 'age_band'
    seriesField 'priority'
    datasets {
      dataset {
        field 'open_tickets'
        label 'Open tickets'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Open backlog by priority'
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

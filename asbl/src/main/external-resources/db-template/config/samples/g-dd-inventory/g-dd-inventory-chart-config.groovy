chart('chart_dd19-chart-space-used-by-warehouse') {
  type 'bar'
  data {
    labelField 'warehouse'
    datasets {
      dataset {
        field 'capacity_pct'
        label '% of capacity'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Space used by warehouse, % of capacity'
      }
      legend {
        display false
      }
    }
    scales {
      y {
        suggestedMax 100
      }
    }
  }
}


chart('chart_dd19-chart-slow-movers-by-value') {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'stuck_value'
        label 'Value stuck'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Slow movers by value, no sale in 90 days'
      }
      legend {
        display false
      }
    }
  }
}

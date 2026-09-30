chart('chart_dd17-chart-cost-per-month-by-department') {
  type 'bar'
  data {
    labelField 'month'
    seriesField 'department'
    datasets {
      dataset {
        field 'total_cost'
        label 'Cost'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Cost per month by department'
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


chart('chart_dd17-chart-cost-components') {
  type 'doughnut'
  data {
    labelField 'component'
    datasets {
      dataset {
        field 'amount'
        label 'Amount'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'What the cost is made of'
      }
    }
  }
}


chart('chart_dd17-chart-warehouse-overtime-hours') {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'overtime_hours'
        label 'Overtime hours'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Warehouse overtime hours per month'
      }
      legend {
        display false
      }
    }
  }
}

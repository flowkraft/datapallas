chart('chart_dd18-chart-headcount-over-time') {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'headcount'
        label 'Headcount'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Headcount over time'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd18-chart-attrition-by-department') {
  type 'bar'
  data {
    labelField 'department'
    datasets {
      dataset {
        field 'attrition_pct'
        label 'Attrition % a year'
      }
    }
  }
  options {
    indexAxis 'y'
    plugins {
      title {
        display true
        text 'Attrition a year, over the 33 months (leavers in brackets)'
      }
      legend {
        display false
      }
    }
  }
}


chart('chart_dd18-chart-boxplot-salary-by-level') {
  type 'boxplot'
  data {
    labelField 'level_and_side'
    datasets {
      dataset {
        field 'base_salary_annual'
        label 'Base salary'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Salary by level: Customer Support against everyone else'
      }
    }
  }
}


chart('chart_dd18-chart-tenure-bins') {
  type 'bar'
  data {
    labelField 'tenure'
    datasets {
      dataset {
        field 'people'
        label 'People'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'How long people have stayed'
      }
      legend {
        display false
      }
    }
  }
}

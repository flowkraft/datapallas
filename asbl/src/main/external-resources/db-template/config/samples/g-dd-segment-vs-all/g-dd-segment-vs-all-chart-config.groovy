chart('chart_dd25-chart-category-share-here-vs-everyone') {
  type 'bar'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'share_here_pct'
        label 'Here, % of revenue'
      }
      dataset {
        field 'share_everywhere_pct'
        label 'Everywhere, % of revenue'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Category share: here vs everyone'
      }
    }
  }
}


chart('chart_dd25-chart-quarterly-index') {
  type 'line'
  data {
    labelField 'quarter'
    datasets {
      dataset {
        field 'index_here'
        label 'Here'
      }
      dataset {
        field 'index_everywhere'
        label 'Everywhere'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Quarterly revenue index, here vs everyone, first quarter = 100'
      }
    }
  }
}


chart('chart_dd25-chart-channel-mix-here') {
  type 'pie'
  data {
    labelField 'channel'
    datasets {
      dataset {
        field 'share_pct'
        label '% of orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Channel mix here'
      }
    }
  }
}

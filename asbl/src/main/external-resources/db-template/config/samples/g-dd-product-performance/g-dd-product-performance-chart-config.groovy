chart('chart_dd05-chart-rating-vs-units') {
  type 'scatter'
  data {
    labelField 'rating'
    datasets {
      dataset {
        field 'units'
        label 'Units sold'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Rating against units sold, one dot per product'
      }
    }
  }
}


chart('chart_dd05-chart-discount-vs-return-rate') {
  type 'bubble'
  data {
    labelField 'discount_pct'
    datasets {
      dataset {
        field 'return_rate_pct'
        label 'Return rate %'
      }
    }
  }
  options {
    bubbleSizeField 'bubble_size'
    plugins {
      title {
        display true
        text 'Discount % against return rate, sized by revenue, last six months'
      }
    }
  }
}


chart('chart_dd05-chart-top-n-by-margin') {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'gross_margin'
        label 'Gross margin'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Top by gross margin'
      }
    }
  }
}


chart('chart_dd05-chart-bottom-n-by-margin') {
  type 'row'
  data {
    labelField 'product'
    datasets {
      dataset {
        field 'gross_margin'
        label 'Gross margin'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Bottom by gross margin'
      }
    }
  }
}

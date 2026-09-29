chart('chart_channel_channel') {
  type 'bar'
  data {
    labelField 'Channel'
    datasets {
      dataset {
        field 'Orders'
        label 'Orders'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Orders by Channel'
      }
    }
  }
}

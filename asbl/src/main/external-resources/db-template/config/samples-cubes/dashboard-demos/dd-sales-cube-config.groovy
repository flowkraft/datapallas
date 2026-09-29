// ═══════════════════════════════════════════════════════════════════════════
// Demo Sales — what was sold, line by line
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per order line, with the order it belongs to, the
// customer who placed it, the city the order went to and the product sold.
//
// Grain: one order line. Revenue, Cost, Gross Profit, Margin and Units are all
// per line; Orders counts the different orders those lines belong to, which is
// why it is a count of distinct order_id and not a count of rows. Nothing that
// lives on the order and not on the line - the shipping fee, the order's tax -
// is a measure here: summed at line grain it would be counted once per line.
// The finance cube answers those questions on the invoice.
//
// Joins, all many_to_one, so no measure is multiplied:
//   dash_demo.orders on order_id, dash_demo.products on product_id, and, hanging
//   off the order, dash_demo.customers on customer_id and dash_demo.geo_cities
//   on city_id. The generator writes them as LEFT joins.
//
// Cancelled orders: every measure carries the same filter the demo data's own
// truths use, status <> 'cancelled', so a number read here is the number the
// dashboards show. The 508 cancelled orders are still in the cube - Order
// Status has them, and a count of lines would see them - they simply do not
// count as sales.
//
// What it can answer: revenue and margin by month, quarter or year, by Channel,
// Country, Category, Brand, Product and customer Segment; how many orders and
// how many units are behind that revenue; and which of those splits is carrying
// the rest.
//
// Data: dash_demo.order_lines (59,996 lines, 58,706 of them sold), which is
// 54,411,955.71 of revenue against 36,466,647.26 of cost on 23,492 orders.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'dash_demo.order_lines'
  title 'Demo Sales'
  description 'Revenue, cost, margin and units, by month, channel, country, category, brand and segment'
  currency 'EUR'

  join {
    name 'dash_demo.orders'
    title 'Orders'
    description 'The order the line belongs to'
    sql '${CUBE}.order_id = dash_demo.orders.order_id'
    relationship 'many_to_one'
  }
  join {
    name 'dash_demo.products'
    title 'Products'
    description 'The product the line sold'
    sql '${CUBE}.product_id = dash_demo.products.product_id'
    relationship 'many_to_one'
  }
  join {
    name 'dash_demo.customers'
    title 'Customers'
    description 'The customer who placed the order'
    parent 'dash_demo.orders'
    sql 'dash_demo.orders.customer_id = dash_demo.customers.customer_id'
    relationship 'many_to_one'
  }
  join {
    name 'dash_demo.geo_cities'
    title 'Cities'
    description 'The city the order was shipped to, and the country it is in'
    parent 'dash_demo.orders'
    sql 'dash_demo.orders.city_id = dash_demo.geo_cities.city_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'OrderId'
    title 'Order'
    description 'The order number the line belongs to'
    sql '${CUBE}.order_id'
    type 'number'
  }
  dimension {
    name 'OrderedAt'
    title 'Ordered'
    description 'When the order was placed. Group it by month, quarter or year'
    sql 'dash_demo.orders.order_ts'
    type 'time'
  }
  dimension {
    name 'Channel'
    title 'Channel'
    description 'Where the order came from: web, mobile_app, marketplace or sales_rep'
    sql 'dash_demo.orders.channel'
    type 'string'
  }
  dimension {
    name 'OrderStatus'
    title 'Order Status'
    description 'completed, returned or cancelled. The measures leave the cancelled orders out'
    sql 'dash_demo.orders.status'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the order was shipped to'
    sql 'dash_demo.geo_cities.country'
    type 'string'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'The category the product is in'
    sql 'dash_demo.products.category'
    type 'string'
  }
  dimension {
    name 'Brand'
    title 'Brand'
    description 'The brand the product is sold under'
    sql 'dash_demo.products.brand'
    type 'string'
  }
  dimension {
    name 'Product'
    title 'Product'
    description 'The product the line sold'
    sql 'dash_demo.products.name'
    type 'string'
  }
  dimension {
    name 'Segment'
    title 'Segment'
    description 'The segment the customer is in: Consumer, SMB or Enterprise'
    sql 'dash_demo.customers.segment'
    type 'string'
  }

  measure {
    name 'Revenue'
    title 'Revenue'
    description 'What was sold, at line level, on the orders that were not cancelled'
    sql '${CUBE}.line_amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "dash_demo.orders.status <> 'cancelled'"
    }
  }
  measure {
    name 'Cost'
    title 'Cost'
    description 'What the items sold cost us, on the orders that were not cancelled'
    sql '${CUBE}.line_cost'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "dash_demo.orders.status <> 'cancelled'"
    }
  }
  measure {
    name 'GrossProfit'
    title 'Gross Profit'
    description 'Revenue less Cost. PICK THIS WHEN: the question is what the sales left, not what they were worth'
    sql '${Revenue} - ${Cost}'
    type 'number'
    format 'currency'
  }
  measure {
    name 'MarginPct'
    title 'Margin %'
    description "Gross Profit as a share of Revenue, a fraction from 0.0 to 1.0 shown as a percentage. PICK THIS WHEN: comparing categories, brands or countries that do not sell the same amount, where the profit alone says nothing. It follows the filters: with Category = Laptops it is that category's own margin"
    sql '1.0 * ${GrossProfit} / NULLIF(${Revenue}, 0)'
    type 'number'
    format 'percent'
  }
  measure {
    name 'Qty'
    title 'Units'
    description 'How many items were sold, on the orders that were not cancelled'
    sql '${CUBE}.qty'
    type 'sum'
    format 'number'
    filters {
      filter sql: "dash_demo.orders.status <> 'cancelled'"
    }
  }
  measure {
    name 'Orders'
    title 'Orders'
    description 'How many different orders the lines in the answer belong to. PICK THIS WHEN: the question is how many orders, not how many lines - an order with four lines is one order'
    sql '${CUBE}.order_id'
    type 'count_distinct'
    filters {
      filter sql: "dash_demo.orders.status <> 'cancelled'"
    }
  }

  segment {
    name 'returned'
    title 'Returned'
    description 'Lines on orders that came back'
    sql "dash_demo.orders.status = 'returned'"
  }
  segment {
    name 'online'
    title 'Online'
    description 'Lines on orders placed on the web or in the mobile app'
    sql "dash_demo.orders.channel IN ('web', 'mobile_app')"
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Online Sales — the online store
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per order, with its customer and — through the order
// lines — the products on it, so the same sale reads by order or line by line.
//
// Joins: cube_demo.shop_order_lines on order_id, one_to_many; through it
// cube_demo.shop_products on product_id, many_to_one; and
// cube_demo.shop_customers on customer_id, many_to_one. All LEFT joins, so a
// guest order with no customer still counts.
//
// Grain: one row per order. The one_to_many join to the lines repeats an order
// once per line, and the generator handles that by itself: a measure that lives
// on the order (Orders, ShippingFees) is summed once per order in a WITH, while
// a measure that lives on the line (Lines, Units, GrossSales, AvgDiscountPct)
// is summed over the lines. Germany answers 749 orders, not the 2,108 line rows
// the join produces, and the shipping fee is added once per order however many
// lines it has.
//
// What it can answer:
//   - how much was sold and to how many people (Orders, GrossSales, NetSales,
//     Units, Customers, ShippingFees, AvgOrderValue);
//   - line by line: how many lines and at what discount (Lines, DiscountPct,
//     AvgDiscountPct, LineNo);
//   - what a sale leaves and what it gave away (Cost of Goods, Gross Margin,
//     Margin %, Discount Given, Discount Rate), each with the format it is shown
//     in, and the cube's one currency (EUR);
//   - by where the customer is (Country, City), since when they have been one
//     (Customer Since), by what was bought (Category, Brand, Product, SKU), by
//     when (OrderDate, readable by day, week, month, quarter or year) and by how
//     the order came in (Channel, Status);
//   - with the shipped and guest_orders segments for the two questions worth
//     asking on their own.
//
// Net Sales is the figure a finance team reports: the line value after the
// line discount, on orders that were neither cancelled nor returned. The
// status test is the measure's own filters, so Net Sales means the same thing
// wherever it is read, beside a Gross Sales that counts every status.
//
// This file holds a second cube, 'shop-for-a-period', at the bottom: the same
// sale read line by line, between two days the viewer picks.
//
// Data: cube_demo.shop_orders (3,000 orders, 240 of them guest orders),
// cube_demo.shop_order_lines (8,500 lines), cube_demo.shop_products (80) and
// cube_demo.shop_customers (400).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.shop_orders'
  title 'Online Sales'
  description 'Orders, shipping fees and sales, by country and by product category'
  currency 'EUR'

  join {
    name 'cube_demo.shop_order_lines'
    title 'Order Lines'
    description 'The lines of the order'
    sql '${CUBE}.order_id = cube_demo.shop_order_lines.order_id'
    relationship 'one_to_many'
  }
  join {
    name 'cube_demo.shop_products'
    title 'Products'
    description 'The product on the order line'
    sql 'cube_demo.shop_order_lines.product_id = cube_demo.shop_products.product_id'
    relationship 'many_to_one'
    parent 'cube_demo.shop_order_lines'
  }
  join {
    name 'cube_demo.shop_customers'
    title 'Customers'
    description 'The customer who placed the order. Empty on a guest order'
    sql '${CUBE}.customer_id = cube_demo.shop_customers.customer_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'OrderId'
    title 'Order'
    description 'The order number'
    sql '${CUBE}.order_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'OrderDate'
    title 'Ordered'
    description 'The day the order was placed'
    sql '${CUBE}.order_date'
    type 'time'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Where the order stands'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'Channel'
    title 'Channel'
    description 'How the order came in'
    sql '${CUBE}.channel'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country of the customer. Empty on a guest order'
    sql 'cube_demo.shop_customers.country'
    type 'string'
  }
  dimension {
    name 'City'
    title 'City'
    description 'The city of the customer. Empty on a guest order'
    sql 'cube_demo.shop_customers.city'
    type 'string'
  }
  dimension {
    name 'SignupDate'
    title 'Customer Since'
    description 'The day the customer signed up. Empty on a guest order'
    sql 'cube_demo.shop_customers.signup_date'
    type 'time'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'The product category on the order line'
    sql 'cube_demo.shop_products.category'
    type 'string'
  }
  dimension {
    name 'Brand'
    title 'Brand'
    description 'The product brand on the order line'
    sql 'cube_demo.shop_products.brand'
    type 'string'
  }
  dimension {
    name 'Product'
    title 'Product'
    description 'The product on the order line'
    sql 'cube_demo.shop_products.name'
    type 'string'
  }
  dimension {
    name 'Sku'
    title 'SKU'
    description 'The product code on the order line'
    sql 'cube_demo.shop_products.sku'
    type 'string'
  }
  dimension {
    name 'LineNo'
    title 'Line'
    description 'Which line of the order this is'
    sql 'cube_demo.shop_order_lines.line_no'
    type 'number'
  }
  dimension {
    name 'DiscountPct'
    title 'Discount %'
    description 'The discount given on the order line'
    sql 'cube_demo.shop_order_lines.discount_pct'
    type 'number'
  }

  measure {
    name 'Orders'
    title 'Orders'
    description 'How many orders there are. An order with ten lines still counts once'
    type 'count'
  }
  measure {
    name 'ShippingFees'
    title 'Shipping Fees'
    description 'The shipping fees, added up once per order'
    sql '${CUBE}.shipping_fee'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'GrossSales'
    title 'Gross Sales'
    description 'What was sold, before discount: quantity times unit price on every order line'
    sql 'cube_demo.shop_order_lines.qty * cube_demo.shop_order_lines.unit_price'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'NetSales'
    title 'Net Sales'
    description 'What was sold after the discount on each line, on the orders that were neither cancelled nor returned'
    sql 'cube_demo.shop_order_lines.qty * cube_demo.shop_order_lines.unit_price * (100 - cube_demo.shop_order_lines.discount_pct) * 0.01'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.status NOT IN ('Cancelled', 'Returned')"
    }
  }
  measure {
    name 'ShareOfNetSales'
    title 'Share of Net Sales'
    description "This group's share of the net sales of every group in the answer (0.0 to 1.0). PICK THIS WHEN: asking which categories, channels or countries carry the business. It follows the filters: with Country = Germany, each share is of Germany's total, not of the whole shop"
    sql '${NetSales}'
    type 'number'
    share_of_total true
    format 'percent'
  }
  measure {
    name 'Units'
    title 'Units'
    description 'How many items were sold'
    sql 'cube_demo.shop_order_lines.qty'
    type 'sum'
    format 'number'
  }
  measure {
    name 'Customers'
    title 'Customers'
    description 'How many different customers ordered. A guest order counts nobody'
    sql '${CUBE}.customer_id'
    type 'count_distinct'
  }
  measure {
    name 'AvgOrderValue'
    title 'Average Order Value'
    description 'What an order is worth on average, before discount'
    sql '${GrossSales} / NULLIF(${Orders}, 0)'
    type 'number'
    format 'currency'
  }
  measure {
    name 'Lines'
    title 'Lines'
    description 'How many order lines there are. An order with ten lines counts ten'
    sql 'cube_demo.shop_order_lines.line_no'
    type 'count'
  }
  measure {
    name 'AvgDiscountPct'
    title 'Average Discount %'
    description 'The average discount on an order line'
    sql 'cube_demo.shop_order_lines.discount_pct'
    type 'avg'
  }

  // ── The board pack: what a sale costs, what it leaves, and what it gave away ──
  // Each one carries its own format, so every table, chart and export shows it the
  // same way, and the two ratios are worked out by the query - a total is the ratio
  // of the totals, never the average of the rows.
  measure {
    name 'UnitsSold'
    title 'Units Sold'
    description 'How many items were sold, on the orders that were neither cancelled nor returned. PICK THIS WHEN: the question is about the margin the sales left, next to Net Sales and Cost of Goods.'
    sql 'cube_demo.shop_order_lines.qty'
    type 'sum'
    format 'number'
    filters {
      filter sql: "\${CUBE}.status NOT IN ('Cancelled', 'Returned')"
    }
  }
  measure {
    name 'CostOfGoods'
    title 'Cost of Goods'
    description 'What the items sold cost to buy, on the orders that were neither cancelled nor returned'
    sql 'cube_demo.shop_order_lines.qty * cube_demo.shop_products.cost_price'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.status NOT IN ('Cancelled', 'Returned')"
    }
  }
  measure {
    name 'GrossMargin'
    title 'Gross Margin'
    description 'What is left of Net Sales after the cost of the goods'
    sql '${NetSales} - ${CostOfGoods}'
    type 'number'
    format 'currency'
  }
  measure {
    name 'MarginPct'
    title 'Margin %'
    description 'Gross Margin as a share of Net Sales (0.0 to 1.0). PICK THIS WHEN: comparing how profitable categories, brands or channels are, not how big they are'
    sql '${GrossMargin} / NULLIF(${NetSales}, 0)'
    type 'number'
    format 'percent'
  }
  measure {
    name 'DiscountGiven'
    title 'Discount Given'
    description 'The money the line discounts gave away, on the orders that were neither cancelled nor returned'
    sql 'cube_demo.shop_order_lines.qty * cube_demo.shop_order_lines.unit_price * cube_demo.shop_order_lines.discount_pct * 0.01'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.status NOT IN ('Cancelled', 'Returned')"
    }
  }
  measure {
    name 'DiscountRate'
    title 'Discount Rate'
    description 'What the discounts gave away, as a share of what those orders were worth before them (0.0 to 1.0). Net Sales plus Discount Given is that figure. PICK THIS WHEN: asking how much of the price is being given away, weighted by what was sold - Average Discount % weighs every line the same'
    sql '${DiscountGiven} / NULLIF(${DiscountGiven} + ${NetSales}, 0)'
    type 'number'
    format 'percent'
  }

  segment {
    name 'shipped'
    title 'Shipped'
    description 'Orders that have left the warehouse'
    sql "\${CUBE}.status = 'Shipped'"
  }
  segment {
    name 'guest_orders'
    title 'Guest orders'
    description 'Orders placed without an account'
    sql "\${CUBE}.customer_id IS NULL"
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Sales for a Period — the same sale, between two days the viewer picks
// ════════════════════════════════════════════════════════════════════════════
//
// Almost every sales report starts with a period, and this cube is the sale
// read line by line inside one.
//
// The period is not declared here. A cube declares no parameters: a dashboard
// declares its own, once, in its -report-parameters-spec.groovy, and a cube
// only uses the names. What a viewer picks on the Cube Stories page is the
// cube's own date filter on OrderDate - the same chip every other dimension
// gets - and a hint presets it, written relative to the day the data itself
// calls today ({dataToday}), never to this machine's clock: the demo data is
// re-seeded around a moving today, and a fixed day would quietly stop meaning
// "this quarter".
//
// Each end of the period is its own filter, so a viewer who clears the to-date
// asks "from that day onwards", and one who clears both asks about everything.
//
// Grain: one row per order line, which is why this cube counts units and net
// sales rather than orders: cube_demo.shop_order_lines is the table, and the
// order and the product are joined many_to_one onto it.
//
// What it can answer: what was sold in a period, by category (Units, Net
// Sales), and what the quarter before or the same quarter a year ago holds -
// the same question with other dates, which is what the hints show.
// ════════════════════════════════════════════════════════════════════════════

cube('shop-for-a-period') {
  sql_table 'cube_demo.shop_order_lines'
  title 'Sales for a Period'
  description 'What was sold between two days the viewer picks, by product category'
  currency 'EUR'

  join {
    name 'cube_demo.shop_orders'
    title 'Orders'
    description 'The order the line is on'
    sql '${CUBE}.order_id = cube_demo.shop_orders.order_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.shop_products'
    title 'Products'
    description 'The product on the line'
    sql '${CUBE}.product_id = cube_demo.shop_products.product_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'OrderDate'
    title 'Ordered'
    description 'The day the order the line is on was placed - the period this cube is read by'
    sql 'cube_demo.shop_orders.order_date'
    type 'time'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'The product category on the order line'
    sql 'cube_demo.shop_products.category'
    type 'string'
  }

  measure {
    name 'Units'
    title 'Units'
    description 'How many items were sold, on the orders that were neither cancelled nor returned'
    sql '${CUBE}.qty'
    type 'sum'
    filters {
      filter sql: "cube_demo.shop_orders.status NOT IN ('Cancelled', 'Returned')"
    }
  }
  measure {
    name 'NetSales'
    title 'Net Sales'
    description 'What was sold after the discount on each line, on the orders that were neither cancelled nor returned'
    sql '${CUBE}.qty * ${CUBE}.unit_price * (100 - ${CUBE}.discount_pct) * 0.01'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "cube_demo.shop_orders.status NOT IN ('Cancelled', 'Returned')"
    }
  }
}

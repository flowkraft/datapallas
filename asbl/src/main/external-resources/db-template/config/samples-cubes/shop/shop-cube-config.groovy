// ═══════════════════════════════════════════════════════════════════════════
// Shop — the online store
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: two cubes. Orders is what the store sold, one row per order,
// with its customer and — through the order lines — the products on it. Order
// Lines is the same sale read line by line, which is where discount lives.
//
// Grain: one row per order, and one row per order line. That difference is the
// point of the file: Orders counts orders, not lines, and the shipping fee is
// added once per order however many lines it has. Germany answers 749 orders,
// not the 2,108 line rows the join produces.
//
// Joins (Orders): cube_demo.shop_order_lines (one_to_many),
// cube_demo.shop_products through the lines (many_to_one, parent
// cube_demo.shop_order_lines) and cube_demo.shop_customers (many_to_one, LEFT,
// so a guest order stays in the answer with no customer).
//
// What they can answer:
//   - orders, units and sales by country, city, channel, status and month;
//   - what sells, by category, brand and product — through the lines, while the
//     order-level measures stay right;
//   - sales before and after discount (GrossSales, NetSales) and what an order
//     is worth on average (AvgOrderValue);
//   - how many people bought, without counting anyone twice (Customers is a
//     distinct count, so it holds even when the answer is grouped through the
//     lines; a guest order counts nobody), and the named filters shipped and
//     guest_orders;
//   - line by line, how deep the discounts go (AvgDiscountPct, LineGross,
//     LineNet).
//
// Data: cube_demo.shop_orders (3,000), cube_demo.shop_order_lines (8,500),
// cube_demo.shop_products (80), cube_demo.shop_customers (400).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.shop_orders'
  title 'Orders'
  description 'Orders, shipping fees and sales, by country and by product category'

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
    description 'What was sold after the discount on each line'
    sql 'cube_demo.shop_order_lines.qty * cube_demo.shop_order_lines.unit_price * (1 - cube_demo.shop_order_lines.discount_pct / 100.0)'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'Units'
    title 'Units'
    description 'How many items were sold'
    sql 'cube_demo.shop_order_lines.qty'
    type 'sum'
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

cube('order_lines') {
  sql_table 'cube_demo.shop_order_lines'
  title 'Order Lines'
  description 'The sale line by line: what was on each order, and at what discount'

  join {
    name 'cube_demo.shop_products'
    title 'Products'
    description 'The product on the line'
    sql '${CUBE}.product_id = cube_demo.shop_products.product_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.shop_orders'
    title 'Orders'
    description 'The order the line belongs to'
    sql '${CUBE}.order_id = cube_demo.shop_orders.order_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'OrderId'
    title 'Order'
    description 'The order number'
    sql '${CUBE}.order_id'
    type 'number'
  }
  dimension {
    name 'LineNo'
    title 'Line'
    description 'Which line of the order this is'
    sql '${CUBE}.line_no'
    type 'number'
  }
  dimension {
    name 'Product'
    title 'Product'
    description 'The product on the line'
    sql 'cube_demo.shop_products.name'
    type 'string'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'The product category'
    sql 'cube_demo.shop_products.category'
    type 'string'
  }
  dimension {
    name 'Brand'
    title 'Brand'
    description 'The product brand'
    sql 'cube_demo.shop_products.brand'
    type 'string'
  }
  dimension {
    name 'DiscountPct'
    title 'Discount %'
    description 'The discount given on this line'
    sql '${CUBE}.discount_pct'
    type 'number'
  }
  dimension {
    name 'OrderDate'
    title 'Ordered'
    description 'The day the order was placed'
    sql 'cube_demo.shop_orders.order_date'
    type 'time'
  }

  measure {
    name 'Lines'
    title 'Lines'
    description 'How many order lines there are'
    type 'count'
  }
  measure {
    name 'Units'
    title 'Units'
    description 'How many items were sold'
    sql '${CUBE}.qty'
    type 'sum'
  }
  measure {
    name 'LineGross'
    title 'Line Gross'
    description 'What the lines come to before discount'
    sql '${CUBE}.qty * ${CUBE}.unit_price'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'LineNet'
    title 'Line Net'
    description 'What the lines come to after discount'
    sql '${CUBE}.qty * ${CUBE}.unit_price * (1 - ${CUBE}.discount_pct / 100.0)'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'AvgDiscountPct'
    title 'Average Discount %'
    description 'How deep the discount goes on a line, on average'
    sql '${CUBE}.discount_pct'
    type 'avg'
  }
}

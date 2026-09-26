// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 13 — Online Store Sales
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "orders, shipping fees and sales by country, and what sells by
// category?"
// Who asks it: the e-commerce manager.
//
// What the cube does here: totals that stay right when an order has several
// lines. Orders is a count of orders, not of order lines, and the shipping fee
// is counted once per order however many lines it has. Germany answers 749
// orders, not the 2,108 line rows the join produces.
//
// It also counts customers without counting anyone twice: Customers is a
// distinct count of the customer on the order, so it stays right even when the
// answer is grouped by product category, through the order lines. Guest orders
// have no customer and count 0.
//
// Data: cube_demo.shop_orders (3,000), cube_demo.shop_order_lines (8,000+),
// cube_demo.shop_products (120), cube_demo.shop_customers (400).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.shop_orders'
  title 'Online Store Sales'
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
}

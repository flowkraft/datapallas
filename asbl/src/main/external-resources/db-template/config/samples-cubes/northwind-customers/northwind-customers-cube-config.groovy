// ═══════════════════════════════════════════════════════════════════════════
// Northwind Customer Management cube
// ═══════════════════════════════════════════════════════════════════════════
//
// Cube source: Customers
// Connection: rbt-sample-northwind-sqlite-4f2
//
// Entire point: CRM / sales-ops view of the customer base — who they are,
// where they are, how active they are, AND how much they spend.
//
// Different cube source from the Sales cube — grain is "one row per customer"
// (not one row per order line) — so it answers questions Sales cannot answer
// naturally:
//   - "How many customers do we have in each country?"
//   - "Which customers spend the most money?" ← THE entire point of CRM
//   - "What's the average order value per customer?"
//   - "When did each customer first/last order?"
//   - "Which contact titles are decision-makers?"
//
// JOIN graph (2-level chain — Order Details required for revenue):
//
//   Customers (cube source)
//     └── Orders         (L1, parent=CUBE — one_to_many)
//           └── "Order Details" (L2, parent=Orders — one_to_many)
//
// Why join Order Details? Because Northwind Orders has NO total/value column —
// order value is COMPUTED from line items. Without this join the Customer
// cube cannot answer "who are our biggest customers by revenue".
//
// Schema validated against db-northwind-sqlite-information-schema.json:
// Customers columns are CustomerID, PostalCode, City, Country, Region, Fax,
// Phone, ContactName, ContactTitle, CompanyName, Address, Email.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'Customers'
  title 'Northwind Customer Management'
  description 'Customer base, order activity and revenue analysis for CRM and sales-ops'

  // ── Dimensions: Customers (cube source) ────────────────────────────────
  dimension {
    name 'CustomerID'
    title 'Customer ID'
    description 'Unique customer identifier (5-character code)'
    sql '${CUBE}.CustomerID'
    type 'string'
    primary_key true
  }
  dimension {
    name 'CustomerCompanyName'
    title 'Company'
    description 'Customer company name'
    sql 'CompanyName'
    type 'string'
  }
  dimension {
    name 'ContactName'
    title 'Contact Name'
    description 'Primary contact person at the customer'
    sql 'ContactName'
    type 'string'
  }
  dimension {
    name 'ContactTitle'
    title 'Contact Title'
    description 'Job title of the primary contact (decision-maker analysis)'
    sql 'ContactTitle'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'Customer country'
    sql 'Country'
    type 'string'
  }
  dimension {
    name 'City'
    title 'City'
    description 'Customer city'
    sql 'City'
    type 'string'
  }

  // ── Dimensions: Orders (L1 join — for time slicing AND per-order browsing) ──
  // Pick OrderID + OrderDate (and optionally ShippedDate) when you want a row
  // per individual order for invoice-ledger / order-history browsing.
  // When grouping by OrderID, use the OrderValue measure (not CustomerLifetimeValue).
  dimension {
    name 'OrderID'
    title 'Order ID'
    description 'Unique order identifier. Pick this dimension to establish per-order grain for invoice/order-ledger browsing.'
    sql 'Orders.OrderID'
    type 'number'
  }
  dimension {
    name 'OrderDate'
    title 'Order Date'
    description 'When the order was placed (slice customers by ordering era, or list individual orders chronologically)'
    sql 'Orders.OrderDate'
    type 'time'
  }
  dimension {
    name 'OrderShippedDate'
    title 'Order Shipped Date'
    description 'When the order shipped (NULL = not yet shipped). Useful in per-order browsing alongside OrderDate.'
    sql 'Orders.ShippedDate'
    type 'time'
  }

  // ── Measures ────────────────────────────────────────────────────────────
  measure {
    name 'CustomerCount'
    title 'Customer Count'
    description 'Number of distinct customers'
    sql '${CUBE}.CustomerID'
    type 'count_distinct'
  }
  measure {
    name 'OrderCount'
    title 'Order Count'
    description 'Number of distinct orders placed'
    sql 'Orders.OrderID'
    type 'count_distinct'
  }
  // ── Revenue measures (two grain-specific names for the same SQL) ──
  // Both measures compute SUM(UnitPrice \u00d7 Quantity \u00d7 (1 - Discount)) across line
  // items. The semantic difference depends on the GROUP BY grain:
  //   - At customer grain (no OrderID picked):     this is the customer's total
  //     spend with us \u2192 use CustomerLifetimeValue.
  //   - At order grain (OrderID picked):           the SUM rolls up to a single
  //     order \u2192 use OrderValue.
  // Same math, different label \u2014 pick the one whose name matches your grain.
  measure {
    name 'CustomerLifetimeValue'
    title 'Customer Lifetime Value (CLV)'
    description 'Total revenue from a customer across all their orders. PICK THIS WHEN: grouping by Customer (no OrderID). DO NOT pick this when grouping by Order ID \u2014 use Order Value instead.'
    sql '("Order Details".UnitPrice * "Order Details".Quantity * (1 - "Order Details".Discount))'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'OrderValue'
    title 'Order Value'
    description 'Total value of an individual order. PICK THIS WHEN: grouping by Order ID for invoice/order-ledger browsing. For customer totals use Customer Lifetime Value instead.'
    sql '("Order Details".UnitPrice * "Order Details".Quantity * (1 - "Order Details".Discount))'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'AvgOrderValue'
    title 'Average Order Value'
    description "Average line revenue \u2014 grain-agnostic. At customer grain it shows avg line value per customer; at order grain it shows the order's avg line value."
    sql '("Order Details".UnitPrice * "Order Details".Quantity * (1 - "Order Details".Discount))'
    type 'avg'
    format 'currency'
  }
  measure {
    name 'EarliestOrderDate'
    title 'First Order'
    description 'Date of the earliest order from this customer'
    sql 'Orders.OrderDate'
    type 'min'
  }
  measure {
    name 'LatestOrderDate'
    title 'Most Recent Order'
    description 'Date of the most recent order from this customer (churn risk indicator)'
    sql 'Orders.OrderDate'
    type 'max'
  }

  // ── Joins (2-level chain) ──────────────────────────────────────────────
  join {
    name 'Orders'
    parent 'CUBE'
    sql '${CUBE}.CustomerID = Orders.CustomerID'
    relationship 'one_to_many'
  }
  join {
    name '"Order Details"'
    parent 'Orders'
    sql 'Orders.OrderID = "Order Details".OrderID'
    relationship 'one_to_many'
  }

  // ── Segments ────────────────────────────────────────────────────────────
  segment {
    name 'usa_customers'
    title 'USA Customers'
    description 'Customers based in the USA'
    sql "\${CUBE}.Country = 'USA'"
  }
  segment {
    name 'uk_customers'
    title 'UK Customers'
    description 'Customers based in the United Kingdom'
    sql "\${CUBE}.Country = 'UK'"
  }
  segment {
    name 'german_customers'
    title 'German Customers'
    description 'Customers based in Germany'
    sql "\${CUBE}.Country = 'Germany'"
  }
  segment {
    name 'french_customers'
    title 'French Customers'
    description 'Customers based in France'
    sql "\${CUBE}.Country = 'France'"
  }
  segment {
    name 'decision_makers'
    title 'Decision Makers'
    description 'Customers whose contact is an Owner or Manager (decision-makers)'
    sql "\${CUBE}.ContactTitle LIKE '%Owner%' OR \${CUBE}.ContactTitle LIKE '%Manager%'"
  }
  segment {
    name 'with_email'
    title 'Has Email Contact'
    description 'Customers with an email address on file (data-quality / outreach segment)'
    sql "\${CUBE}.Email IS NOT NULL AND \${CUBE}.Email != ''"
  }
  segment {
    name 'shipped_orders'
    title 'Shipped Orders'
    description 'Limit to orders that have been shipped'
    sql 'Orders.ShippedDate IS NOT NULL'
  }
  segment {
    name 'unshipped_orders'
    title 'Outstanding Orders'
    description 'Limit to orders not yet shipped (outstanding)'
    sql 'Orders.ShippedDate IS NULL'
  }

  // ── Hierarchies ─────────────────────────────────────────────────────────
  hierarchy {
    name 'customer_geography'
    title 'Customer Geography'
    levels 'Country', 'City', 'CustomerCompanyName'
  }
  hierarchy {
    name 'contact_role'
    title 'Contact Role'
    levels 'ContactTitle', 'CustomerCompanyName'
  }
}

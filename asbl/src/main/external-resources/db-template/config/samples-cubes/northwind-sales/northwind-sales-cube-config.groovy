// ═══════════════════════════════════════════════════════════════════════════
// Northwind Sales Analysis cube
// ═══════════════════════════════════════════════════════════════════════════
//
// Cube source: Orders (the order header table)
// Connection: rbt-sample-northwind-sqlite-4f2 (bundled SQLite Northwind)
//
// Entire point: answer transactional sales questions — who bought what, when,
// for how much money, by which sales rep, was it shipped on time, was a
// discount applied. Covers samples 12–18 (Customer Statements, Customer Sales
// Summary, Customer Invoices, Category-Region Crosstab, Monthly Sales Trend,
// Supplier Scorecards, Sales Dashboard).
//
// Design discipline: every dimension/measure/segment is here because it
// directly supports a real sales-analysis question. Customer-CRM details
// belong in the Customer cube. Product-catalog details belong in the
// Inventory cube. HR details belong in the HR cube. Sales cube focuses
// on the SALE itself.
//
// JOIN graph (validated by transitive join resolution):
//
//   Orders (cube source)
//     ├── "Order Details"  (L1, parent=CUBE — one_to_many)
//     │     └── Products    (L2, parent="Order Details" — many_to_one)
//     │           ├── Categories (L3, parent=Products — many_to_one)
//     │           └── Suppliers  (L3, parent=Products — many_to_one)
//     ├── Customers          (L1, parent=CUBE — many_to_one)
//     ├── Employees          (L1, parent=CUBE — many_to_one)
//     └── Shippers           (L1, parent=CUBE — many_to_one)
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'Orders'
  title 'Northwind Sales Analysis'
  description 'Sales transactions by customer, employee, product, time and geography'

  // ── Dimensions: Orders (cube source) ───────────────────────────────────
  dimension {
    name 'OrderID'
    title 'Order ID'
    description 'Unique order identifier'
    sql '${CUBE}.OrderID'
    type 'number'
    primary_key true
  }
  dimension {
    name 'OrderDate'
    title 'Order Date'
    description 'When the order was placed'
    sql 'OrderDate'
    type 'time'
  }
  dimension {
    name 'ShippedDate'
    title 'Shipped Date'
    description 'When the order shipped (NULL = not yet shipped)'
    sql 'ShippedDate'
    type 'time'
  }
  dimension {
    name 'ShipCountry'
    title 'Ship Country'
    description 'Destination country'
    sql 'ShipCountry'
    type 'string'
  }
  dimension {
    name 'ShipCity'
    title 'Ship City'
    description 'Destination city'
    sql 'ShipCity'
    type 'string'
  }

  // ── Dimensions: Order Details (L1 join, spaced identifier) ─────────────
  dimension {
    name 'Quantity'
    title 'Line Quantity'
    description 'Units sold per line item'
    sql '"Order Details".Quantity'
    type 'number'
  }
  dimension {
    name 'LineUnitPrice'
    title 'Line Unit Price'
    description 'Unit price actually paid (per line item)'
    sql '"Order Details".UnitPrice'
    type 'number'
  }
  dimension {
    name 'Discount'
    title 'Discount'
    description 'Discount applied to line item (0.0 to 1.0)'
    sql '"Order Details".Discount'
    type 'number'
  }

  // ── Dimensions: Products (L2 join via Order Details) ───────────────────
  dimension {
    name 'ProductName'
    title 'Product'
    description 'Product name'
    sql 'Products.ProductName'
    type 'string'
  }

  // ── Dimensions: Categories (L3 join via Products) ─────────────────────
  dimension {
    name 'CategoryName'
    title 'Category'
    description 'Product category name'
    sql 'Categories.CategoryName'
    type 'string'
  }

  // ── Dimensions: Suppliers (L3 join via Products) ──────────────────────
  dimension {
    name 'SupplierName'
    title 'Supplier'
    description 'Supplier company name'
    sql 'Suppliers.CompanyName'
    type 'string'
  }
  dimension {
    name 'SupplierCountry'
    title 'Supplier Country'
    description 'Country where the supplier is based'
    sql 'Suppliers.Country'
    type 'string'
  }

  // ── Dimensions: Customers (L1 join) ────────────────────────────────────
  dimension {
    name 'CustomerCompanyName'
    title 'Customer'
    description 'Customer company name'
    sql 'Customers.CompanyName'
    type 'string'
  }
  dimension {
    name 'CustomerCountry'
    title 'Customer Country'
    description 'Country where the customer is based'
    sql 'Customers.Country'
    type 'string'
  }
  dimension {
    name 'CustomerCity'
    title 'Customer City'
    description 'City where the customer is based'
    sql 'Customers.City'
    type 'string'
  }

  // ── Dimensions: Employees (L1 join) ────────────────────────────────────
  dimension {
    name 'EmployeeName'
    title 'Sales Rep'
    description 'Employee who took the order (concatenated first + last name)'
    sql "Employees.FirstName || ' ' || Employees.LastName"
    type 'string'
  }

  // ── Dimensions: Shippers (L1 join) ─────────────────────────────────────
  dimension {
    name 'ShipperName'
    title 'Shipper'
    description 'Shipping company name'
    sql 'Shippers.CompanyName'
    type 'string'
  }

  // ── Measures ────────────────────────────────────────────────────────────
  measure {
    name 'OrderCount'
    title 'Order Count'
    description 'Number of unique orders. PICK THIS WHEN: NOT grouping by OrderID. (At order grain it always returns 1, which is meaningless.)'
    sql '${CUBE}.OrderID'
    type 'count_distinct'
  }
  // ── Revenue measures (two grain-specific names for the same SQL) ──
  // Both compute SUM(UnitPrice \u00d7 Quantity \u00d7 (1 - Discount)) across line items.
  // The semantic difference depends on the GROUP BY grain:
  //   - At customer / category / supplier / time grain: this is total revenue
  //     for that group \u2192 use Revenue.
  //   - At order grain (OrderID picked): the SUM rolls up to a single order's
  //     value \u2192 use OrderValue (semantically honest label).
  // Same math, different label \u2014 pick the one whose name matches your grain.
  measure {
    name 'Revenue'
    title 'Revenue'
    description 'Sum of (UnitPrice \u00d7 Quantity \u00d7 (1 - Discount)) across all line items in scope. PICK THIS WHEN: grouping at customer / product / category / supplier / time grain. For per-order browsing use Order Value instead.'
    sql '("Order Details".UnitPrice * "Order Details".Quantity * (1 - "Order Details".Discount))'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'OrderValue'
    title 'Order Value'
    description 'Total value of an individual order. PICK THIS WHEN: grouping by Order ID for invoice-ledger / per-order browsing. For aggregated revenue use Revenue instead.'
    sql '("Order Details".UnitPrice * "Order Details".Quantity * (1 - "Order Details".Discount))'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'TotalQuantity'
    title 'Units Sold'
    description 'Total quantity sold across all line items'
    sql '"Order Details".Quantity'
    type 'sum'
  }
  measure {
    name 'AvgDiscount'
    title 'Average Discount'
    description 'Average discount applied across line items (0.0 to 1.0 \u2014 multiply by 100 for percent)'
    sql '"Order Details".Discount'
    type 'avg'
  }
  measure {
    name 'TotalFreight'
    title 'Total Freight'
    description 'Sum of freight charges.'
    sql '${CUBE}.Freight'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'UniqueCustomers'
    title 'Unique Customers'
    description 'Number of distinct customers'
    sql '${CUBE}.CustomerID'
    type 'count_distinct'
  }
  measure {
    name 'UniqueProducts'
    title 'Unique Products'
    description 'Number of distinct products sold'
    sql '"Order Details".ProductID'
    type 'count_distinct'
  }

  // ── Joins (with parent chain for transitive resolution) ────────────────
  // Note: "Order Details" join name is pre-quoted because the table has a space.
  // The renderTableName() helper passes pre-quoted names through verbatim, and
  // the substring detection in detectReferencedTables looks for "Order Details".
  join {
    name '"Order Details"'
    parent 'CUBE'
    sql '${CUBE}.OrderID = "Order Details".OrderID'
    relationship 'one_to_many'
  }
  join {
    name 'Products'
    parent '"Order Details"'
    sql '"Order Details".ProductID = Products.ProductID'
    relationship 'many_to_one'
  }
  join {
    name 'Categories'
    parent 'Products'
    sql 'Products.CategoryID = Categories.CategoryID'
    relationship 'many_to_one'
  }
  join {
    name 'Suppliers'
    parent 'Products'
    sql 'Products.SupplierID = Suppliers.SupplierID'
    relationship 'many_to_one'
  }
  join {
    name 'Customers'
    parent 'CUBE'
    sql '${CUBE}.CustomerID = Customers.CustomerID'
    relationship 'many_to_one'
  }
  join {
    name 'Employees'
    parent 'CUBE'
    sql '${CUBE}.EmployeeID = Employees.EmployeeID'
    relationship 'many_to_one'
  }
  join {
    name 'Shippers'
    parent 'CUBE'
    sql '${CUBE}.ShipVia = Shippers.ShipperID'
    relationship 'many_to_one'
  }

  // ── Segments (named WHERE clauses) ─────────────────────────────────────
  segment {
    name 'shipped'
    title 'Shipped Orders'
    description 'Orders that have been shipped'
    sql '${CUBE}.ShippedDate IS NOT NULL'
  }
  segment {
    name 'unshipped'
    title 'Not Yet Shipped'
    description 'Orders still pending shipment (outstanding)'
    sql '${CUBE}.ShippedDate IS NULL'
  }
  segment {
    name 'late_shipment'
    title 'Late Shipments'
    description 'Orders shipped after the customer-promised required date'
    sql '${CUBE}.ShippedDate > ${CUBE}.RequiredDate'
  }
  segment {
    name 'with_discount'
    title 'Discounted Lines'
    description 'Line items with a non-zero discount applied'
    sql '"Order Details".Discount > 0'
  }

  // ── Hierarchies (drill-down paths) ─────────────────────────────────────
  hierarchy {
    name 'customer_geography'
    title 'Customer Geography'
    levels 'CustomerCountry', 'CustomerCity'
  }
  hierarchy {
    name 'ship_geography'
    title 'Ship-To Geography'
    levels 'ShipCountry', 'ShipCity'
  }
  hierarchy {
    name 'product_taxonomy'
    title 'Product Taxonomy'
    levels 'CategoryName', 'ProductName'
  }
}

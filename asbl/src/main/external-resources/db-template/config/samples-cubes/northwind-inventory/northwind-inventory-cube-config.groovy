// ═══════════════════════════════════════════════════════════════════════════
// Northwind Product Inventory cube
// ═══════════════════════════════════════════════════════════════════════════
//
// Cube source: Products
// Connection: rbt-sample-northwind-sqlite-4f2
//
// Entire point: manage the product catalog and stock — what we have, what's
// running low, who supplies it, what's our inventory worth.
//
// Different grain than the Sales cube — one row per product (not one row per
// sale) — so it answers questions the Sales cube cannot answer naturally:
//   - "Which products are low stock?"
//   - "What is the dollar value of stock on hand?" (THE inventory KPI)
//   - "Which suppliers have the most products?"
//   - "Average unit price by category?"
//   - "How many products are discontinued?"
//
// JOIN graph (only L1 joins):
//
//   Products (cube source)
//     ├── Categories (L1, parent=CUBE — many_to_one)
//     └── Suppliers  (L1, parent=CUBE — many_to_one)
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table '"Products"'
  title 'Northwind Product Inventory'
  description 'Product catalog with stock levels, categories and suppliers'

  // ── Dimensions: Products (cube source) ─────────────────────────────────
  dimension {
    name 'ProductID'
    title 'Product ID'
    description 'Unique product identifier'
    sql '"ProductID"'
    type 'number'
    primary_key true
  }
  dimension {
    name 'ProductName'
    title 'Product Name'
    description 'Name of the product'
    sql '"ProductName"'
    type 'string'
  }
  dimension {
    name 'QuantityPerUnit'
    title 'Pack Size'
    description 'Quantity per package (e.g. "10 boxes x 20 bags")'
    sql '"QuantityPerUnit"'
    type 'string'
  }
  dimension {
    name 'Discontinued'
    title 'Discontinued'
    description '1 if the product is no longer sold, 0 if active'
    sql '"Discontinued"'
    type 'number'
  }
  dimension {
    name 'UnitsInStock'
    title 'Units In Stock'
    description 'Current inventory count'
    sql '"UnitsInStock"'
    type 'number'
  }
  dimension {
    name 'UnitsOnOrder'
    title 'Units On Order'
    description 'Units currently on order from suppliers'
    sql '"UnitsOnOrder"'
    type 'number'
  }
  dimension {
    name 'ReorderLevel'
    title 'Reorder Level'
    description 'Minimum stock threshold before reordering (may be NULL)'
    sql '"ReorderLevel"'
    type 'number'
  }
  dimension {
    name 'UnitPrice'
    title 'Unit Price'
    description 'Catalog price per unit'
    sql '"UnitPrice"'
    type 'number'
  }

  // ── Dimensions: Categories (L1 join) ───────────────────────────────────
  dimension {
    name 'CategoryName'
    title 'Category'
    description 'Product category name'
    sql '"Categories"."CategoryName"'
    type 'string'
  }

  // ── Dimensions: Suppliers (L1 join) ────────────────────────────────────
  dimension {
    name 'SupplierName'
    title 'Supplier'
    description 'Supplier company name'
    sql '"Suppliers"."CompanyName"'
    type 'string'
  }
  dimension {
    name 'SupplierCountry'
    title 'Supplier Country'
    description 'Country where the supplier is based (sourcing strategy / compliance)'
    sql '"Suppliers"."Country"'
    type 'string'
  }
  dimension {
    name 'SupplierCity'
    title 'Supplier City'
    description 'City where the supplier is based (concentration-risk analysis)'
    sql '"Suppliers"."City"'
    type 'string'
  }

  // ── Measures ────────────────────────────────────────────────────────────
  // Most measures here are designed for category / supplier grain. At
  // per-product grain (grouping by ProductID or ProductName) they degenerate:
  // ProductCount/UniqueSuppliers always = 1, AvgUnitPrice = the product's own
  // price. Use the per-product dimensions (UnitsInStock, UnitPrice, etc.) for
  // browsing one row per product.
  measure {
    name 'ProductCount'
    title 'Product Count'
    description 'Number of distinct products. PICK THIS WHEN: grouping by category / supplier / segment. (At product grain it always returns 1.)'
    type 'count'
  }
  measure {
    name 'InventoryValue'
    title 'Inventory Value'
    description 'Dollar value of stock on hand (UnitsInStock \u00d7 UnitPrice). The classic inventory KPI.'
    sql '(${CUBE}."UnitsInStock" * ${CUBE}."UnitPrice")'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'TotalUnitsInStock'
    title 'Total Units In Stock'
    description 'Sum of all units currently in stock'
    sql '${CUBE}."UnitsInStock"'
    type 'sum'
  }
  measure {
    name 'TotalUnitsOnOrder'
    title 'Total Units On Order'
    description 'Sum of all units currently on order from suppliers'
    sql '${CUBE}."UnitsOnOrder"'
    type 'sum'
  }
  measure {
    name 'AvgUnitPrice'
    title 'Average Unit Price'
    description "Average catalog price. PICK THIS WHEN: grouping by category / supplier. (At product grain it just returns the single product's own price.)"
    sql '${CUBE}."UnitPrice"'
    type 'avg'
    format 'currency'
  }
  measure {
    name 'UniqueSuppliers'
    title 'Unique Suppliers'
    description 'Number of distinct suppliers. PICK THIS WHEN: grouping by category / segment. (At product or supplier grain it always returns 1.)'
    sql '${CUBE}."SupplierID"'
    type 'count_distinct'
  }

  // ── Joins (L1 only) ─────────────────────────────────────────────────────
  join {
    name '"Categories"'
    parent 'CUBE'
    sql '${CUBE}."CategoryID" = "Categories"."CategoryID"'
    relationship 'many_to_one'
  }
  join {
    name '"Suppliers"'
    parent 'CUBE'
    sql '${CUBE}."SupplierID" = "Suppliers"."SupplierID"'
    relationship 'many_to_one'
  }

  // ── Segments ────────────────────────────────────────────────────────────
  segment {
    name 'in_stock'
    title 'In Stock'
    description 'Products with at least one unit in stock'
    sql '${CUBE}."UnitsInStock" > 0'
  }
  segment {
    name 'out_of_stock'
    title 'Out of Stock'
    description 'Products with zero units in stock'
    sql '${CUBE}."UnitsInStock" = 0'
  }
  segment {
    name 'reorder_needed'
    title 'Reorder Needed'
    description 'Products at or below their reorder level'
    sql '${CUBE}."UnitsInStock" <= ${CUBE}."ReorderLevel" AND ${CUBE}."ReorderLevel" > 0'
  }
  segment {
    name 'active'
    title 'Active Products'
    description 'Products that are not discontinued'
    sql '${CUBE}."Discontinued" = 0'
  }
  segment {
    name 'discontinued'
    title 'Discontinued'
    description 'Products that are discontinued'
    sql '${CUBE}."Discontinued" = 1'
  }

  // ── Hierarchies ─────────────────────────────────────────────────────────
  hierarchy {
    name 'product_taxonomy'
    title 'Product Taxonomy'
    levels 'CategoryName', 'ProductName'
  }
  hierarchy {
    name 'supplier_geography'
    title 'Supplier Geography'
    levels 'SupplierCountry', 'SupplierCity', 'SupplierName'
  }
}

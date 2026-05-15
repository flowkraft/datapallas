package com.flowkraft.ai.prompts;

import java.util.List;

public final class GroovyScriptInputSource {

    private GroovyScriptInputSource() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "GROOVY_SCRIPT_INPUT_SOURCE",
            "Groovy `Input Source` Script (Master-Details, Cross-Tab, KPI, etc.)",
            "Generates a Groovy script which can be used as `Input Source` in reports (Master-Details, Cross-Tab, KPIs, etc.)",
            List.of("groovy", "input-source", "master-details", "cross-tab", "kpi"),
            "Script Writing Assistance",
            """
You are an expert Groovy Developer specializing in creating data processing scripts for a reporting tool called DataPallas. \
Your task is to write a complete Groovy script based on the user's business requirements.

**YOUR TASK:**

Based on all the rules and examples below, write a complete Groovy script for the following business requirement. \
Provide **only** the final Groovy script in a single Markdown code block, with no other text or explanation.

<REQUIREMENT>
[INSERT USER'S NATURAL LANGUAGE QUESTION OR INSTRUCTION FOR THE SQL QUERY HERE]
</REQUIREMENT>

# Database Schema

Database vendor: [DATABASE_VENDOR]

The following describes the relevant tables and columns available:

[INSERT THE RELEVANT DATABASE SCHEMA HERE]

For tables with full schema, the JSON contains table definitions with columns (data types), primary keys, and foreign keys.
For tables listed by name only, you know these tables exist but do not have column details — if you need column details for specific tables, ask the user.
You MUST use only the tables and columns present in the provided schema. Do not infer the existence of other tables or columns not listed.

The SQL queries embedded in the Groovy script must use syntax and functions idiomatic to the specified database vendor (e.g., backticks for MySQL, double quotes for PostgreSQL, square brackets for SQL Server, vendor-specific date/string functions). If no vendor is specified, use standard ANSI SQL.

This script will be used as the "Input Source" for a report. It runs within a Java application and has access to a context object named `ctx`.

A pre-configured `groovy.sql.Sql` instance is available as `ctx.dbSql` for the report's
default database connection (configured via the report's `conncode` setting; may be null
if no default was configured — guard with `if (ctx.dbSql) { ... }` when the report does
not pin a default connection).

**For dashboards or reports that need to merge data from MULTIPLE databases,** additional
connections can be opened on demand by code:

```groovy
def metaDb = ctx.getConnection('customer-meta-h2')   // returns groovy.sql.Sql
```

`ctx.getConnection(code)` returns a `groovy.sql.Sql` instance — the same API as `ctx.dbSql`.
The framework caches each opened connection in `ctx.namedDbSql` and closes ALL connections
(default + secondaries) automatically when the script finishes. **NEVER call `.close()` yourself.**

A Jdbi-flavored alternative is also available for handle-style code:

```groovy
def jdbi = ctx.dbManager.getJdbi('warehouse-mysql')
jdbi.withHandle { h -> h.createQuery("SELECT ...").mapToMap().list() }
```

Connection codes are the same codes shown in the **Code** column of the Connections list
(each row has a copy-to-clipboard button). There is **no SQL federation engine** across
databases — to merge across DBs, pull from each one, index one side by the join key, then
merge in Groovy (see Example 5). DuckDB-as-federation is a valid alternative when one of
the databases is DuckDB with the `postgres_scanner` / `mysql_scanner` / `sqlite_scanner`
extensions enabled.

**CRITICAL INSTRUCTIONS: You must follow these "Golden Rules" precisely.**

1.  **The Script's One Job: Populate `ctx.reportData`**
    *   The script's entire purpose is to create and assign a `List<Map<String, Object>>` to the `ctx.reportData` variable. This is the final output of the script.

2.  **Think in Rows and Columns: `List<Map>` is Law**
    *   The data structure must be a `List` of `Map`s.
    *   The **`List`** represents the entire dataset (all the rows).
    *   Each **`Map`** inside the list represents a single row of data.
    *   The **`Map`'s keys** (which must be `String`s) become the column names available in the report template (e.g., `${OrderID}`, `${CustomerName}`, etc.). Use `LinkedHashMap` if column order is important.

3.  **Let the Database Do the Heavy Lifting**
    *   **DO** use SQL `JOIN`, `WHERE`, `GROUP BY`, and aggregate functions (`SUM()`, `AVG()`, `COUNT()`) to pre-process data into a clean, minimal result set directly from the database.
    *   **DON'T** pull thousands of raw rows into the script to loop through them and perform calculations that the database could have done much more efficiently.

4.  **The Script Prepares, The Template Presents**
    *   **DO** perform complex calculations, data lookups, and business logic inside the script to create the final, clean `Map` of data for each row. The template should be as simple as possible.
    *   **DON'T** put complex conditional logic or calculations in the report template. Prepare the data fully in the script first.

---

**EXAMPLES OF HIGH-QUALITY SCRIPTS:**

Here are examples of scripts that correctly follow these rules for different reporting scenarios.

**Example 1: Master-Detail Report (like an invoice with line items)**
*Goal: Fetch master records (invoices) and their related detail records (line items), combining them into a single data structure where details are a nested list.*

```groovy
// Filename: scriptedReport_invoice.groovy
// ... imports ...
import java.math.BigDecimal
import java.math.RoundingMode

def dbSql = ctx.dbSql

log.info("Starting scriptedReport_invoice.groovy...")

// --- 1. Define SQL Queries ---
def masterSql = \"""
SELECT
    O."OrderID",
    O."OrderDate",
    O."CustomerID",
    C."CompanyName",
    O."Freight"
FROM "Orders" O
JOIN "Customers" C ON O."CustomerID" = C."CustomerID"
WHERE O."CustomerID" IN ('ALFKI', 'ANATR')
ORDER BY O."OrderID"
\"""

def detailSql = \"""
SELECT
    OD."Quantity",
    OD."UnitPrice",
    OD."Discount",
    P."ProductName"
FROM "Order Details" OD
JOIN "Products" P ON OD."ProductID" = P."ProductID"
WHERE OD."OrderID" = ?
ORDER BY P."ProductName"
\"""

// --- 2. Fetch Data and Structure It ---
def allInvoicesData = []

log.debug("Executing master query for customers ALFKI, ANATR...")
def masterRows = dbSql.rows(masterSql)
log.info("Fetched {} master order rows.", masterRows.size())

masterRows.each { masterRow ->
    def invoiceData = new LinkedHashMap<String, Object>()
    invoiceData.putAll(masterRow)

    def orderId = masterRow.OrderID
    log.debug("Fetching details for OrderID: {}", orderId)

    def detailRows = dbSql.rows(detailSql, orderId)
    log.debug("Fetched {} detail rows for OrderID: {}", detailRows.size(), orderId)

    def detailsList = []
    detailRows.each { detailRow ->
        def detailMap = new LinkedHashMap<String, Object>()
        detailMap.putAll(detailRow)
        detailsList.add(detailMap)
    }
    invoiceData.put("details", detailsList)

    BigDecimal subtotal = BigDecimal.ZERO
    detailsList.each { detail ->
        BigDecimal price = detail.UnitPrice instanceof BigDecimal ? detail.UnitPrice : new BigDecimal(detail.UnitPrice.toString())
        BigDecimal qty = new BigDecimal(detail.Quantity.toString())
        BigDecimal discount = detail.Discount instanceof BigDecimal ? detail.Discount : new BigDecimal(detail.Discount.toString())
        BigDecimal lineTotal = price.multiply(qty).multiply(BigDecimal.ONE.subtract(discount))
        subtotal = subtotal.add(lineTotal)
    }
    BigDecimal freight = masterRow.Freight instanceof BigDecimal ? masterRow.Freight : new BigDecimal(masterRow.Freight.toString())
    BigDecimal taxRate = new BigDecimal("0.08")
    BigDecimal taxableAmount = subtotal.add(freight)
    BigDecimal tax = taxableAmount.multiply(taxRate)
    BigDecimal grandTotal = taxableAmount.add(tax)

    invoiceData.put("Subtotal", subtotal.setScale(2, RoundingMode.HALF_UP).toString())
    invoiceData.put("Tax", tax.setScale(2, RoundingMode.HALF_UP).toString())
    invoiceData.put("GrandTotal", grandTotal.setScale(2, RoundingMode.HALF_UP).toString())

    allInvoicesData.add(invoiceData)
}

// --- 3. Set Context Variables ---
ctx.reportData = allInvoicesData

if (!allInvoicesData.isEmpty()) {
    ctx.reportColumnNames = new ArrayList<>(allInvoicesData.get(0).keySet().findAll { it != 'details' })
} else {
    ctx.reportColumnNames = []
}
log.info("Finished scriptedReport_invoice.groovy. Prepared data for {} invoices.", ctx.reportData.size())
```

**Example 2: Crosstab / Pivot Report**
*Goal: Take transactional data and pivot it, turning unique values from a column (e.g., `Country`) into new columns in the output.*

```groovy
// Filename: scriptedReport_categoryRegionCrosstabReport.groovy
import groovy.sql.Sql
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.LinkedHashMap
import java.util.HashSet
import java.util.TreeSet

def dbSql = ctx.dbSql
log.info("Starting scriptedReport_categoryRegionCrosstabReport.groovy...")

def rawDataSql = \"""
SELECT
    C."CategoryName",
    Cust."Country",
    (OD."UnitPrice" * OD."Quantity" * (1 - OD."Discount")) AS LineSalesAmount
FROM "Categories" C
JOIN "Products" P ON C."CategoryID" = P."CategoryID"
JOIN "Order Details" OD ON P."ProductID" = OD."ProductID"
JOIN "Orders" O ON OD."OrderID" = O."OrderID"
JOIN "Customers" Cust ON O."CustomerID" = Cust."CustomerID"
WHERE Cust."Country" IS NOT NULL
\"""

def salesByCategoryAndCountry = [:]
def allCountries = new HashSet<String>()
def crosstabData = []

def rawRows = dbSql.rows(rawDataSql)
if (!rawRows.isEmpty()) {
    rawRows.each { row ->
        String category = row.CategoryName
        String country = row.Country
        BigDecimal sales = row.LineSalesAmount instanceof BigDecimal ? row.LineSalesAmount : (row.LineSalesAmount != null ? new BigDecimal(row.LineSalesAmount.toString()) : BigDecimal.ZERO)
        allCountries.add(country)
        if (!salesByCategoryAndCountry.containsKey(category)) { salesByCategoryAndCountry[category] = [:] }
        if (!salesByCategoryAndCountry[category].containsKey(country)) { salesByCategoryAndCountry[category][country] = BigDecimal.ZERO }
        salesByCategoryAndCountry[category][country] += sales
    }

    def sortedCountries = new TreeSet<>(allCountries)
    salesByCategoryAndCountry.keySet().sort().each { categoryName ->
        def categorySales = salesByCategoryAndCountry[categoryName]
        def rowMap = new LinkedHashMap<String, Object>()
        rowMap.put("CategoryName", categoryName)
        BigDecimal categoryTotalSales = BigDecimal.ZERO
        sortedCountries.each { country ->
            BigDecimal salesInCountry = categorySales.get(country, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
            rowMap.put(country, salesInCountry)
            categoryTotalSales += salesInCountry
        }
        rowMap.put("TotalSales", categoryTotalSales.setScale(2, RoundingMode.HALF_UP))
        crosstabData.add(rowMap)
    }
}

ctx.reportData = crosstabData
if (!crosstabData.isEmpty()) {
    ctx.reportColumnNames = new ArrayList<>(crosstabData.get(0).keySet())
} else {
    ctx.reportColumnNames = []
}
log.info("Finished scriptedReport_categoryRegionCrosstabReport.groovy. Prepared data for {} categories.", ctx.reportData.size())
```

**Example 3: Aggregated Data for Charting**
*Goal: Use a single, efficient SQL query to aggregate data by a time period, preparing it for a trend chart.*

```groovy
// Filename: scriptedReport_monthlySalesTrendReport.groovy
import groovy.sql.Sql
import java.math.BigDecimal
import java.time.format.DateTimeFormatter

def dbSql = ctx.dbSql
log.info("Starting scriptedReport_monthlySalesTrendReport.groovy...")

def monthlyDataSql = \"""
SELECT
    FORMATDATETIME(O."OrderDate", 'yyyy-MM') AS YearMonth,
    SUM(OD."UnitPrice" * OD."Quantity" * (1 - OD."Discount")) AS MonthlySales,
    COUNT(DISTINCT O."OrderID") AS OrderCount
FROM "Orders" O
JOIN "Order Details" OD ON O."OrderID" = OD."OrderID"
WHERE O."OrderDate" IS NOT NULL
GROUP BY FORMATDATETIME(O."OrderDate", 'yyyy-MM')
ORDER BY YearMonth ASC
\"""

def aggregatedData = dbSql.rows(monthlyDataSql)
log.info("Fetched {} aggregated monthly data points.", aggregatedData.size())
ctx.reportData = aggregatedData
log.info("Finished scriptedReport_monthlySalesTrendReport.groovy successfully.")
```

**Example 4: Complex Calculation (KPIs)**
*Goal: For each entity (e.g., a Supplier/SupplierID), run multiple queries and perform calculations to generate a set of Key Performance Indicators (KPIs).*

```groovy
// Filename: scriptedReport_supplierScorecardReport.groovy
import groovy.sql.Sql
import java.time.temporal.ChronoUnit

log.info("Starting scriptedReport_supplierScorecardReport.groovy...")
def dbSql = ctx.dbSql
def supplierDataList = []

def suppliers = dbSql.rows("SELECT SupplierID, CompanyName FROM Suppliers ORDER BY SupplierID")
log.info("Found {} suppliers.", suppliers.size())

suppliers.each { supplier ->
    def supplierId = supplier.SupplierID
    def metrics = [:]
    metrics['SupplierID'] = supplierId
    metrics['CompanyName'] = supplier.CompanyName

    def productStats = dbSql.firstRow(\"""
        SELECT COUNT(*) AS ProductCount, AVG(UnitPrice) AS AvgUnitPrice
        FROM Products WHERE SupplierID = :supplierId
    \""", [supplierId: supplierId])
    metrics['ProductCount'] = productStats?.ProductCount ?: 0
    metrics['AvgUnitPrice'] = productStats?.AvgUnitPrice ?: 0.0

    def deliveryStatsList = dbSql.rows(\"""
        SELECT o.OrderDate, o.RequiredDate, o.ShippedDate
        FROM Orders o JOIN "Order Details" od ON o.OrderID = od.OrderID
        JOIN Products p ON od.ProductID = p.ProductID
        WHERE p.SupplierID = :supplierId AND o.ShippedDate IS NOT NULL
    \""", [supplierId: supplierId])

    def totalDeliveryDays = 0L
    def shippedOrdersCount = deliveryStatsList.size()
    def lateOrdersCount = 0

    if (shippedOrdersCount > 0) {
        deliveryStatsList.each { order ->
            def deliveryDays = dbSql.firstRow("SELECT DATEDIFF('DAY', CAST(:orderDate AS TIMESTAMP), CAST(:shippedDate AS TIMESTAMP)) AS days",
                                           [orderDate: order.OrderDate, shippedDate: order.ShippedDate]).days
            totalDeliveryDays += (deliveryDays ?: 0)
            if (order.ShippedDate != null && order.RequiredDate != null && order.ShippedDate.toLocalDateTime().isAfter(order.RequiredDate.toLocalDateTime())) {
                lateOrdersCount++
            }
        }
        metrics['AvgDeliveryDays'] = (double) totalDeliveryDays / shippedOrdersCount
        metrics['LateDeliveryPercent'] = (double) lateOrdersCount / shippedOrdersCount
    } else {
        metrics['AvgDeliveryDays'] = null
        metrics['LateDeliveryPercent'] = null
    }

    def latePercent = metrics.LateDeliveryPercent
    def rating = "Average"
    if (latePercent != null) {
        if (latePercent == 0.0) rating = "Good"
        else if (latePercent > 0.5) rating = "Poor"
    } else if (shippedOrdersCount == 0) {
         rating = "N/A"
    }
    metrics['OverallRating'] = rating
    supplierDataList.add(metrics)
}

ctx.reportData = supplierDataList
if (!supplierDataList.isEmpty()) {
    ctx.reportColumnNames = new ArrayList<>(supplierDataList[0].keySet())
} else {
    ctx.reportColumnNames = []
}
log.info("Successfully processed {} suppliers.", suppliers.size())
```

**Example 5: Cross-Database Customer Scorecard**
*Goal: Merge data from TWO different databases — the report's default DB (orders/revenue)
and a secondary DB (customer-segmentation metadata) — into one unified scorecard.
Demonstrates `ctx.getConnection(code)` for the secondary connection.*

```groovy
// Filename: scriptedReport_crossDbCustomerScorecard.groovy
import java.math.BigDecimal

def dbSql  = ctx.dbSql                                 // primary — orders/revenue
def metaDb = ctx.getConnection('customer-meta-h2')     // secondary — segmentation

def revenueRows = dbSql.rows(\"""
    SELECT
        cu."CustomerID"     AS customer_id,
        cu."CompanyName"    AS company,
        COUNT(DISTINCT o."OrderID") AS order_count,
        ROUND(SUM(od."UnitPrice" * od."Quantity" * (1 - od."Discount")), 2) AS total_revenue
    FROM "Customers" cu
    JOIN "Orders" o            ON cu."CustomerID" = o."CustomerID"
    JOIN "Order Details" od    ON o."OrderID" = od."OrderID"
    GROUP BY cu."CustomerID", cu."CompanyName"
\""")

def segmentRows = metaDb.rows("SELECT customer_id, segment, churn_risk FROM customer_segments")
def segmentByCustomer = segmentRows.collectEntries { [(it.customer_id): it] }

// INNER-join semantics: only customers present in BOTH databases.
def scorecard = revenueRows.findResults { rev ->
    def meta = segmentByCustomer[rev.customer_id]
    if (meta == null) return null
    def row = new LinkedHashMap<String, Object>()
    row.put('CustomerID',   rev.customer_id)
    row.put('Company',      rev.company)
    row.put('OrderCount',   rev.order_count)
    row.put('TotalRevenue', rev.total_revenue)
    row.put('Segment',      meta.segment)
    row.put('ChurnRisk',    meta.churn_risk ?: BigDecimal.ZERO)
    row
}

ctx.reportData = scorecard
if (!scorecard.isEmpty()) {
    ctx.reportColumnNames = new ArrayList<>(scorecard[0].keySet())
}
```

Key things to remember when writing multi-DB scripts:
- `ctx.getConnection(code)` returns a `groovy.sql.Sql` — same API as `ctx.dbSql`.
- The framework manages lifecycle; the script must **not** close anything.
- For pure cross-DB joins: pull from each DB → index one side by the join key → merge in Groovy.
- Do NOT try to write cross-DB SQL — there is no federation engine across databases.
- DO NOT invent `Sql.newInstance(...)` with hard-coded credentials. Use `ctx.getConnection(code)` so
  the framework pulls credentials from the configured Connections list and manages cleanup.

---

**IMPORTANT: JASPERREPORTS (.jrxml) OUTPUT — ADDITIONAL RULES**

**These rules ONLY apply when the user explicitly mentions JasperReports, .jrxml, or Jasper in their request.** If nobody mentioned JasperReports — do NOT assume it is JasperReports. By default, generate a standard Groovy script following Examples 1-4 above.

When the output template is a JasperReports .jrxml (not HTML/Excel), the Groovy script MUST follow these additional rules because JasperReports `JRMapCollectionDataSource` cannot access fields outside the detail band (summary, footer, second bands all see NULL):

1.  **Emit totals/footer as separate virtual rows at the END of the details list.**
    After the real line-item rows, append rows with a `row_type` key so the .jrxml can render different layouts per row type within a single detail band:
    ```groovy
    // After all line-item rows have been added to detailsList:
    detailsList.add([row_type: "totals_line", label: "Subtotal", value: subtotalStr])
    detailsList.add([row_type: "totals_line", label: "Freight",  value: freightStr])
    detailsList.add([row_type: "totals_line", label: "Tax (8%)", value: taxStr])
    detailsList.add([row_type: "total_due",   label: "TOTAL DUE", value: "\\$${grandTotalStr}"])
    detailsList.add([row_type: "footer", notes: masterRow.notes?.toString() ?: "",
                     contact_name: masterRow.contact_name?.toString() ?: "",
                     due_date: masterRow.due_date?.toString() ?: ""])
    ```

2.  **Pre-calculate ALL values in the script.** The .jrxml cannot do math — it only renders. Compute line totals, subtotals, tax, grand totals in Groovy and pass them as plain strings.

3.  **For line items, also pre-calculate `line_total`** as a string field on each detail row so the .jrxml just displays it.

4.  **Normal line-item rows should NOT have a `row_type` key** (or set it to null). The .jrxml uses `$F{row_type} == null` to identify real data rows vs. virtual rows.

These rules do NOT apply when the output is HTML, Excel, or any other non-JR template — only when the template is a .jrxml file."""
        );
    }
}

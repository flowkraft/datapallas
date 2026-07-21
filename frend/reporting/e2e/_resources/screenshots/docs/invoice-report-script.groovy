import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.format.DateTimeFormatter

def dbSql = ctx.dbSql

log.info("Starting invoice report script...")

def DATE_FMT = DateTimeFormatter.ofPattern("MM/dd/yyyy")

// Northwind OrderDate/ShippedDate come back as Timestamp or String depending on the
// JDBC driver — normalise to a LocalDate defensively.
def toLocalDate = { v ->
    if (v == null) return null
    if (v instanceof java.sql.Timestamp) return v.toLocalDateTime().toLocalDate()
    if (v instanceof java.sql.Date) return v.toLocalDate()
    if (v instanceof java.util.Date) return new java.sql.Timestamp(v.time).toLocalDateTime().toLocalDate()
    def s = v.toString()
    if (s.length() >= 10) {
        try { return LocalDate.parse(s.substring(0, 10)) } catch (ex) { return null }
    }
    return null
}

// --- 1. Define SQL Queries ---
// Master: order header + customer bill-to. Same two sample customers as the
// bundled "Customer Invoices" sample (ALFKI + ANATR) → a clean handful of invoices.
def masterSql = """
SELECT
    O."OrderID",
    O."OrderDate",
    O."ShippedDate",
    O."CustomerID",
    C."CompanyName",
    C."ContactName",
    C."Address",
    C."City",
    C."Country",
    O."Freight"
FROM "Orders" O
JOIN "Customers" C ON O."CustomerID" = C."CustomerID"
WHERE O."CustomerID" IN ('ALFKI', 'ANATR')
ORDER BY O."OrderID"
"""

def detailSql = """
SELECT
    OD."Quantity",
    OD."UnitPrice",
    OD."Discount",
    P."ProductName",
    Cat."CategoryName"
FROM "Order Details" OD
JOIN "Products" P ON OD."ProductID" = P."ProductID"
JOIN "Categories" Cat ON P."CategoryID" = Cat."CategoryID"
WHERE OD."OrderID" = ?
ORDER BY P."ProductName"
"""

// --- 2. Fetch Data and Structure It ---
// Emit the field names the professional Apache FOP invoice template expects
// (invoice_id, invoice_date, due_date, status, company/bill-to, details[…], totals),
// mapped from Northwind — so the large-scale invoice design renders unchanged.
def allInvoicesData = []

try {
    def masterRows = dbSql.rows(masterSql)
    log.info("Fetched {} invoice rows.", masterRows.size())

    masterRows.each { masterRow ->
        def invoiceData = new LinkedHashMap<String, Object>()

        def orderDate = toLocalDate(masterRow.OrderDate)
        def shipped = toLocalDate(masterRow.ShippedDate)

        invoiceData.put("invoice_id", masterRow.OrderID)
        invoiceData.put("invoice_date", orderDate != null ? orderDate.format(DATE_FMT) : (masterRow.OrderDate?.toString() ?: ""))
        // Northwind has no due date — present Net-30 from the order date.
        invoiceData.put("due_date", orderDate != null ? orderDate.plusDays(30).format(DATE_FMT) : "")
        // Northwind has no invoice status — a shipped order reads as PAID, else PENDING.
        invoiceData.put("status", shipped != null ? "PAID" : "PENDING")
        invoiceData.put("freight", masterRow.Freight)
        invoiceData.put("company_name", masterRow.CompanyName)
        invoiceData.put("contact_name", masterRow.ContactName)
        invoiceData.put("address", masterRow.Address)
        invoiceData.put("city", masterRow.City)
        invoiceData.put("country", masterRow.Country)
        invoiceData.put("email", "")
        invoiceData.put("notes", "")

        def invoiceId = masterRow.OrderID
        def detailRows = dbSql.rows(detailSql, invoiceId)

        def detailsList = []
        BigDecimal subtotal = BigDecimal.ZERO

        detailRows.each { detailRow ->
            def detailMap = new LinkedHashMap<String, Object>()

            BigDecimal price = detailRow.UnitPrice instanceof BigDecimal ? detailRow.UnitPrice : new BigDecimal(detailRow.UnitPrice.toString())
            BigDecimal qty = new BigDecimal(detailRow.Quantity.toString())
            BigDecimal discount = detailRow.Discount instanceof BigDecimal ? detailRow.Discount : new BigDecimal((detailRow.Discount ?: 0).toString())
            BigDecimal lineTotal = price.multiply(qty).multiply(BigDecimal.ONE.subtract(discount))

            detailMap.put("product_name", detailRow.ProductName)
            detailMap.put("category", detailRow.CategoryName)
            detailMap.put("quantity", detailRow.Quantity)
            detailMap.put("unit_price", detailRow.UnitPrice)
            detailMap.put("discount", detailRow.Discount)
            detailMap.put("line_total", lineTotal.setScale(2, RoundingMode.HALF_UP).toString())

            subtotal = subtotal.add(lineTotal)
            detailsList.add(detailMap)
        }

        invoiceData.put("details", detailsList)

        BigDecimal freight = masterRow.Freight instanceof BigDecimal ? masterRow.Freight : new BigDecimal((masterRow.Freight ?: 0).toString())
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

    log.info("Finished invoice report script. Prepared data for {} invoices.", ctx.reportData.size())

} catch (Exception e) {
    log.error("Error during script execution: {}", e.getMessage(), e)
    throw e
}

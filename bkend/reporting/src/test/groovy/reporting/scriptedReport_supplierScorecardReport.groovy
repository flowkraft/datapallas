import groovy.sql.Sql

/*
 * Scripted Reporter: Supplier Scorecard Report
 *
 * Fetches data for each supplier and calculates key performance indicators (KPIs).
 * Populates ctx.reportData with a list of maps, where each map represents a supplier's scorecard.
 * The 'SupplierID' column is used for bursting (defined in the test setup).
 */

// --- Input ---
// ctx: The BurstingContext object, provided by the ScriptedReporter.
// ctx.dbSql: A pre-configured groovy.sql.Sql instance (if conncode was set).
// ctx.settings: Access to report settings.
// ctx.variables: Access to variables.

// --- Output ---
// ctx.reportData: Must be populated with a List<Map<String, Object>>. Each map is a row.
// ctx.reportColumnNames: Optional, but good practice. List<String> of column names.

log.info("Starting scriptedReport_supplierScorecardReport.groovy...")

def dbSql = ctx.dbSql // Use the provided Sql instance
def supplierDataList = [] // This will hold the data for ctx.reportData

try {
    // 1. Get all suppliers
    def suppliers = dbSql.rows("SELECT SupplierID, CompanyName FROM Suppliers ORDER BY SupplierID")
    log.info("Found {} suppliers.", suppliers.size())

    // 2. Calculate KPIs for each supplier
    suppliers.each { supplier ->
        def supplierId = supplier.SupplierID
        def companyName = supplier.CompanyName
        log.debug("Processing Supplier ID: {}, Name: {}", supplierId, companyName)

        def metrics = [:]
        metrics['SupplierID'] = supplierId // Essential for bursting
        metrics['CompanyName'] = companyName

        // --- Product Metrics ---
        def productStats = dbSql.firstRow("""
            SELECT
                COUNT(*) AS ProductCount,
                AVG(UnitPrice) AS AvgUnitPrice,
                SUM(CASE WHEN UnitsInStock < ReorderLevel THEN 1 ELSE 0 END) AS LowStockCount
            FROM Products
            WHERE SupplierID = :supplierId
        """, [supplierId: supplierId])

        metrics['ProductCount'] = productStats?.ProductCount ?: 0
        metrics['AvgUnitPrice'] = productStats?.AvgUnitPrice ?: 0.0
        metrics['LowStockCount'] = productStats?.LowStockCount ?: 0
        log.debug("  Product Metrics - Count: {}, AvgPrice: {}, LowStock: {}", metrics.ProductCount, metrics.AvgUnitPrice, metrics.LowStockCount)

        // --- Delivery Performance Metrics ---
        // SQLite dialect, deliberately: this script is packaged verbatim as the
        // g-scr2htm-supc sample and runs against the bundled SQLite Northwind.
        //
        // One aggregate query per supplier, rather than one query per shipped
        // order line as this used to do. The date columns hold epoch
        // MILLISECONDS in INTEGER columns (Hibernate maps LocalDateTime onto
        // SQLite's integer affinity), so julianday() needs /1000 and
        // 'unixepoch' - and "shipped late" is then just a numeric comparison,
        // with no date parsing left in Groovy at all. A NULL RequiredDate
        // compares to NULL and falls to ELSE 0, which is the behaviour the
        // per-order null checks used to give.
        //
        // date(...) inside julianday(...) snaps both sides to midnight, so the
        // subtraction is a whole number of calendar days instead of a float
        // carrying the time of day.
        def deliveryStats = dbSql.firstRow("""
            SELECT
                COUNT(*) AS ShippedCount,
                AVG(julianday(date(o.ShippedDate / 1000, 'unixepoch', 'localtime'))
                  - julianday(date(o.OrderDate / 1000, 'unixepoch', 'localtime'))) AS AvgDeliveryDays,
                SUM(CASE WHEN o.ShippedDate > o.RequiredDate THEN 1 ELSE 0 END) AS LateCount
            FROM Orders o
            JOIN "Order Details" od ON o.OrderID = od.OrderID
            JOIN Products p ON od.ProductID = p.ProductID
            WHERE p.SupplierID = :supplierId AND o.ShippedDate IS NOT NULL
        """, [supplierId: supplierId])

        def shippedOrdersCount = (deliveryStats?.ShippedCount ?: 0) as int
        def lateOrdersCount = (deliveryStats?.LateCount ?: 0) as int

        if (shippedOrdersCount > 0) {
            metrics['AvgDeliveryDays'] = ((deliveryStats.AvgDeliveryDays ?: 0) as double)
            metrics['LateDeliveryPercent'] = (double) lateOrdersCount / shippedOrdersCount
        } else {
            // Handle cases with no shipped orders for this supplier
            metrics['AvgDeliveryDays'] = null // Represent N/A as null
            metrics['LateDeliveryPercent'] = null // Represent N/A as null
        }
        log.debug("  Delivery Metrics - Shipped: {}, Late: {}, AvgDays: {}, Late%: {}", shippedOrdersCount, lateOrdersCount, metrics.AvgDeliveryDays, metrics.LateDeliveryPercent)

        // --- Overall Rating (Derived) ---
        def latePercent = metrics.LateDeliveryPercent
        def rating = "Average" // Default
        if (latePercent != null) {
            if (latePercent == 0.0) rating = "Good"
            else if (latePercent > 0.5) rating = "Poor" // Example threshold: > 50% late is poor
        } else if (shippedOrdersCount == 0) {
             rating = "N/A" // No shipped orders to rate
        }
        metrics['OverallRating'] = rating
        log.debug("  Overall Rating: {}", rating)

        // Add the calculated metrics for this supplier to the list
        supplierDataList.add(metrics)
    }

    // 3. Set the results in the context
    ctx.reportData = supplierDataList

    // 4. Explicitly set column names (good practice, ensures order if needed)
    if (!supplierDataList.isEmpty()) {
        // Get keys from the first map, assuming all maps have the same structure
        ctx.reportColumnNames = new ArrayList<>(supplierDataList[0].keySet())
    } else {
        ctx.reportColumnNames = [] // No data, no columns
    }

    log.info("Successfully processed {} suppliers. ctx.reportData contains {} rows.", suppliers.size(), ctx.reportData.size())
    log.debug("Final column names set: {}", ctx.reportColumnNames)

} catch (Exception e) {
    log.error("Error during supplier scorecard script execution: {}", e.message, e)
    // Re-throw the exception so the engine knows something went wrong
    throw e
} finally {
    // The dbSql instance is managed (closed) by the ScriptedReporter itself after script execution.
    log.info("Finished scriptedReport_supplierScorecardReport.groovy.")
}
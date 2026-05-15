// Test-only Groovy script — proves the multi-database scripting API works.
// Pulls from the report's default DB (ctx.dbSql = Northwind H2) AND a second
// DB (ctx.getConnection('customer-meta-h2') = customer-segmentation H2),
// then merges them in Groovy.

import java.math.BigDecimal

def dbSql  = ctx.dbSql                                 // primary — orders/revenue
def metaDb = ctx.getConnection('customer-meta-h2')     // secondary — segmentation

log.info("Starting scriptedReport_crossDbCustomerScorecard.groovy...")

def revenueRows = dbSql.rows("""
    SELECT
        cu."CustomerID"     AS customer_id,
        cu."CompanyName"    AS company,
        COUNT(DISTINCT o."OrderID") AS order_count,
        ROUND(SUM(od."UnitPrice" * od."Quantity" * (1 - od."Discount")), 2) AS total_revenue
    FROM "Customers" cu
    JOIN "Orders" o            ON cu."CustomerID" = o."CustomerID"
    JOIN "Order Details" od    ON o."OrderID" = od."OrderID"
    GROUP BY cu."CustomerID", cu."CompanyName"
""")
log.info("Pulled {} customer-revenue rows from the primary DB.", revenueRows.size())

def segmentRows = metaDb.rows("SELECT customer_id, segment, churn_risk FROM customer_segments")
log.info("Pulled {} segmentation rows from the secondary DB.", segmentRows.size())

def segmentByCustomer = segmentRows.collectEntries { [(it.customer_id): it] }

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
log.info("Cross-DB scorecard prepared for {} customers.", scorecard.size())

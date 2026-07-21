package com.flowkraft

/**
 * One line of an invoice. line_total = qty * unit_price * (1 - discount). Replaced wholesale
 * when its invoice is re-ingested. Table: bp_invoice_line.
 */
class InvoiceLine {

    String productName
    String category             // grey sub-label under the product name on the invoice document
    Integer qty = 1
    BigDecimal unitPrice = 0
    BigDecimal discount = 0     // 0.00–1.00 fraction
    BigDecimal lineTotal = 0

    static belongsTo = [invoice: Invoice]

    static constraints = {
        productName blank: false, maxSize: 120
        category nullable: true, maxSize: 80
        qty min: 0
        unitPrice min: 0.0G
        discount min: 0.0G, max: 1.0G
        lineTotal min: 0.0G
    }

    static mapping = {
        table 'bp_invoice_line'
        productName column: 'product_name'
        unitPrice column: 'unit_price'
        lineTotal column: 'line_total'
    }

    /**
     * Recompute line_total from qty / unit_price / discount.
     *
     * setLineTotal(), not `lineTotal =`: a bare assignment to a field of the declaring class is a
     * direct FIELD write in Groovy, which GORM's setter-based dirty checking never sees — the value
     * would reach the object but never the database unless some other setter dirtied the row first.
     */
    void recompute() {
        setLineTotal((qty ?: 0) * (unitPrice ?: 0G) * (1G - (discount ?: 0G)))
    }

    String toString() { "${qty}× ${productName}" }
}

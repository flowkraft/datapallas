package com.flowkraft

/**
 * A billing invoice with line items. status ∈ {PAID, DUE, OVERDUE}; total = subtotal + tax + freight.
 * Upserted by invoice_number on REST ingest (idempotent). payToken lets a customer pay without
 * logging in (/portal/pay?token=…). Table: bp_invoice.
 */
class Invoice {

    String invoiceNumber
    Date invoiceDate
    Date dueDate
    String status = 'DUE'

    BigDecimal subtotal = 0
    BigDecimal tax = 0
    BigDecimal freight = 0
    BigDecimal total = 0

    String notes      // free-text note rendered in the invoice document's Notes block

    String payToken   // opaque token for unauthenticated pay links

    // Payment tracking (set when paid — real gateway or simulated).
    Date paidAt
    String paymentMethod        // 'stripe' | 'paypal' | 'demo'
    String paymentReference     // gateway txn id / intent id

    Date dateCreated
    Date lastUpdated

    static belongsTo = [customer: Customer]
    static hasMany = [lines: InvoiceLine]

    static constraints = {
        invoiceNumber blank: false, unique: true, maxSize: 40
        invoiceDate nullable: false
        dueDate nullable: false
        status inList: ['PAID', 'DUE', 'OVERDUE']
        subtotal min: 0.0G
        tax min: 0.0G
        freight min: 0.0G
        total min: 0.0G
        notes nullable: true, maxSize: 500
        payToken nullable: true, maxSize: 80
        paidAt nullable: true
        paymentMethod nullable: true, maxSize: 20
        paymentReference nullable: true, maxSize: 120
    }

    static mapping = {
        table 'bp_invoice'
        invoiceNumber column: 'invoice_number'
        invoiceDate column: 'invoice_date'
        dueDate column: 'due_date'
        payToken column: 'pay_token'
        paidAt column: 'paid_at'
        paymentMethod column: 'payment_method'
        paymentReference column: 'payment_reference'
        dateCreated column: 'created_at'
        lastUpdated column: 'updated_at'
        lines cascade: 'all-delete-orphan'
    }

    /** daisyUI badge class for the status pill in the app's LISTS (getter so GSP `${invoice.statusBadgeClass}` works). */
    String getStatusBadgeClass() {
        switch (status) {
            case 'PAID':    return 'badge-soft badge-success'
            case 'OVERDUE': return 'badge-soft badge-error'
            default:        return 'badge-soft badge-warning'   // DUE
        }
    }

    /**
     * Status pill class for the invoice DOCUMENT — a separate vocabulary from the lists' daisyUI
     * badge above, because the document renders inside its own iframe where no daisyUI class exists.
     * Defined in the document's own stylesheet (_invoiceDocumentBody.gsp); both switch on the same
     * `status`, so the two can label an invoice differently only if someone edits one and not the other.
     */
    String getStatusDocClass() {
        switch (status) {
            case 'PAID':    return 'bp-status-paid'
            case 'OVERDUE': return 'bp-status-overdue'
            default:        return 'bp-status-due'
        }
    }

    boolean isPayable() { status != 'PAID' }

    /** Recompute total from the current field values. */
    void recomputeTotal() {
        setTotal((subtotal ?: 0G) + (tax ?: 0G) + (freight ?: 0G))
    }

    /** Mark paid (simple demo settle). */
    void markPaid() { markAsPaid('demo', null) }

    // ── Compatibility shims so the kept Stripe/PayPal services + PaymentController compile
    //    unchanged against this bp_ model (they were written for the old flat Invoice). ──
    BigDecimal getTotalAmount() { total }
    String getCurrency() { 'USD' }
    String getCustomerEmail() { customer?.email }

    /**
     * Mark paid with gateway detail (used by StripeService/PayPalService + the simulated gateway).
     *
     * The explicit setters are REQUIRED. GORM tracks dirty state through the setters
     * (DirtyCheckable.markDirty()), but Groovy compiles a bare `status = 'PAID'` inside the
     * declaring class to a direct FIELD write that skips setStatus(). The field changes and
     * validation passes, yet isDirty() stays false and Hibernate emits no UPDATE — so
     * save(flush: true) returns the invoice happily and persists nothing. Same rule applies to
     * every mutator below: assign through setX() whenever the write must reach the database.
     */
    void markAsPaid(String method, String reference = null) {
        setStatus('PAID')
        setPaidAt(new Date())
        setPaymentMethod(method)
        setPaymentReference(reference)
    }

    String formatTotal() { '$' + String.format('%,.2f', (total ?: 0G)) }

    String toString() { "${invoiceNumber} — ${customer?.name}" }
}

package com.flowkraft

import grails.gorm.transactions.Transactional

/** Admin CRUD over invoices (header-level; line items arrive via REST ingest). */
class InvoiceController {

    static layout = 'admin'

    /**
     * Mutations are POST-only — matching CustomerController, which has said so all along.
     *
     * Without this, every one of them also answered a plain GET, so `GET /admin/invoices/5/delete`
     * destroyed invoice 5. That is not just untidy: an <img src="…/admin/invoices/5/delete"> on any
     * page an administrator happens to open fires it with their session and no form, no click and no
     * token — the browser sends the cookie for them. Requiring POST is what makes a cross-site GET
     * inert. The Next twin gets this free: its mutations are server actions, which are POST-only.
     */
    static allowedMethods = [save: 'POST', update: 'POST', delete: 'POST', markPaid: 'POST']

    // Paginated, searchable admin list. Sort: unpaid first (OVERDUE, then DUE), then PAID —
    // newest (by invoice date) first within each. 10 per page; optional q + status filters.
    static final int PAGE_SIZE = 10
    static final String SORT = "order by case i.status when 'OVERDUE' then 0 when 'DUE' then 1 else 2 end, i.invoiceDate desc"

    def index() {
        String q = (params.q ?: '').toString().trim()
        String status = (params.status ?: '').toString().trim().toUpperCase()

        def args = [:]
        def conds = []
        if (q)                                { conds << '(lower(i.invoiceNumber) like :q or lower(i.customer.name) like :q)'; args.q = '%' + q.toLowerCase() + '%' }
        if (status in ['OVERDUE','DUE','PAID']) { conds << 'i.status = :st'; args.st = status }
        String where = conds ? ('where ' + conds.join(' and ')) : ''

        int total = (Invoice.executeQuery("select count(i) from Invoice i ${where}".toString(), args)[0]) as int
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) PAGE_SIZE))
        int page = Math.min(Math.max(1, params.int('page') ?: 1), totalPages)
        def invoiceList = Invoice.executeQuery("select i from Invoice i ${where} ${SORT}".toString(),
                args, [max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE])

        [invoiceList: invoiceList, invoiceCount: total, page: page, totalPages: totalPages, q: q, status: status]
    }

    def show(Long id) {
        def invoice = Invoice.get(id)
        if (!invoice) { flash.error = 'Invoice not found'; redirect(action: 'index'); return }
        [invoice: invoice]
    }

    def create() {
        // No customer list loaded — the form's picker modal fetches customers on demand (scales to 1000s).
        [invoice: new Invoice(status: 'DUE', invoiceDate: new Date())]
    }

    @Transactional
    def save() {
        def invoice = new Invoice(invoiceParams())
        invoice.customer = Customer.get(params.long('customerId'))
        invoice.recomputeTotal()
        if (!invoice.customer || !invoice.save(flush: true)) {
            flash.error = 'Please provide an invoice number, a customer and valid amounts'
            render(view: 'create', model: [invoice: invoice, customers: Customer.list(sort: 'name')])
            return
        }
        flash.message = "Invoice ${invoice.invoiceNumber} created"
        redirect(action: 'show', id: invoice.id)
    }

    def edit(Long id) {
        def invoice = Invoice.get(id)
        if (!invoice) { flash.error = 'Invoice not found'; redirect(action: 'index'); return }
        [invoice: invoice]
    }

    @Transactional
    def update(Long id) {
        def invoice = Invoice.get(id)
        if (!invoice) { flash.error = 'Invoice not found'; redirect(action: 'index'); return }
        invoice.properties = invoiceParams()
        if (params.customerId) invoice.customer = Customer.get(params.long('customerId'))
        invoice.recomputeTotal()
        invoice.save(flush: true)
        flash.message = "Invoice ${invoice.invoiceNumber} updated"
        redirect(action: 'show', id: invoice.id)
    }

    @Transactional
    def delete(Long id) {
        def invoice = Invoice.get(id)
        if (invoice) {
            def num = invoice.invoiceNumber
            invoice.delete(flush: true)
            flash.message = "Invoice ${num} deleted"
        }
        redirect(action: 'index')
    }

    @Transactional
    def markPaid(Long id) {
        def invoice = Invoice.get(id)
        if (invoice) { invoice.markPaid(); invoice.save(flush: true); flash.message = "Marked ${invoice.invoiceNumber} paid" }
        redirect(action: 'show', id: id)
    }

    // Only the header fields are editable in the admin form.
    private Map invoiceParams() {
        [
            invoiceNumber: params.invoiceNumber,
            status       : params.status,
            invoiceDate  : params.date('invoiceDate', 'yyyy-MM-dd'),
            dueDate      : params.date('dueDate', 'yyyy-MM-dd'),
            subtotal     : (params.subtotal ?: '0') as BigDecimal,
            tax          : (params.tax ?: '0') as BigDecimal,
            freight      : (params.freight ?: '0') as BigDecimal
        ]
    }
}

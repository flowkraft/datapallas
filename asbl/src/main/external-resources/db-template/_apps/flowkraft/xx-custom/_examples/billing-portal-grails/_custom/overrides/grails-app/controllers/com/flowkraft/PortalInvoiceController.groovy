package com.flowkraft

/**
 * Customer invoice views + the pay flow. A logged-in customer sees only their own invoices.
 * pay() serves the logged-in owner; payByToken() is the PUBLIC unauthenticated pay link
 * (/portal/pay?token=...). The demo "Pay" button settles via PaymentGatewayService (simulated
 * when no Stripe/PayPal keys); when a real gateway is configured the pay page drives it via
 * PaymentController instead.
 */
class PortalInvoiceController {

    static layout = 'portal'

    PaymentGatewayService paymentGatewayService

    // The customer's own invoices, sorted unpaid-first (OVERDUE, then DUE, then PAID), newest first,
    // paginated 10 per page. Same sort + pagination contract as the admin list (minus the search box).
    static final int PAGE_SIZE = 10
    static final String SORT = "order by case i.status when 'OVERDUE' then 0 when 'DUE' then 1 else 2 end, i.invoiceDate desc"

    def index() {
        def cust = session.customerId ? Customer.get(session.customerId) : null
        if (!cust) return [invoiceList: [], invoiceCount: 0, page: 1, totalPages: 1]

        int total = (Invoice.executeQuery('select count(i) from Invoice i where i.customer = :c', [c: cust])[0]) as int
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) PAGE_SIZE))
        int page = Math.min(Math.max(1, params.int('page') ?: 1), totalPages)
        def invoiceList = Invoice.executeQuery("select i from Invoice i where i.customer = :c ${SORT}".toString(),
                [c: cust], [max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE])

        [invoiceList: invoiceList, invoiceCount: total, page: page, totalPages: totalPages]
    }

    def show(Long id) {
        def invoice = ownInvoice(id)
        if (!invoice) { flash.error = 'Invoice not found'; redirect(action: 'index'); return }
        [invoice: invoice]
    }

    def pay(Long id) {
        def invoice = ownInvoice(id)
        if (!invoice) { flash.error = 'Invoice not found'; redirect(action: 'index'); return }
        if (request.method == 'POST') { settle(invoice); redirect(action: 'show', id: id); return }
        payModel(invoice, createLink(action: 'pay', id: id), false, false)
    }

    // PUBLIC — no session required; identified by the invoice's pay token.
    def payByToken() {
        def invoice = params.token ? Invoice.findByPayToken(params.token) : null
        if (!invoice) { flash.error = 'Invalid or expired payment link'; redirect(uri: '/login'); return }
        boolean justPaid = false
        if (request.method == 'POST') { settle(invoice); justPaid = true }
        render(view: 'pay', model: payModel(invoice, createLink(action: 'payByToken', params: [token: params.token]), true, justPaid))
    }

    private Invoice ownInvoice(Long id) {
        def inv = id ? Invoice.get(id) : null
        (inv && inv.customer?.id == session.customerId) ? inv : null
    }

    private void settle(Invoice invoice) {
        paymentGatewayService.settleSimulated(invoice)
        flash.message = "Invoice ${invoice.invoiceNumber} paid — thank you!"
    }

    private Map payModel(Invoice invoice, String payUrl, boolean publicPay, boolean justPaid) {
        [
            invoice             : invoice,
            payUrl              : payUrl,
            publicPay           : publicPay,
            justPaid            : justPaid,
            stripeEnabled       : paymentGatewayService.stripeEnabled(),
            stripePublishableKey: paymentGatewayService.stripePublishableKey(),
            payPalEnabled       : paymentGatewayService.payPalEnabled()
        ]
    }
}

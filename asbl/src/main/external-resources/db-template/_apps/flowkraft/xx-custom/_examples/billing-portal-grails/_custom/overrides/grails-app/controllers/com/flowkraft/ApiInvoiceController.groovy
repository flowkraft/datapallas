package com.flowkraft

import grails.converters.JSON
import grails.gorm.transactions.Transactional
import java.time.LocalDate
import java.time.ZoneId

/**
 * REST API — POST /api/invoices. DataPallas pushes each invoice here (the settings.xml curl push).
 * Idempotent create-or-update: upsert customer by email, ensure a CUSTOMER login (never recreated),
 * upsert invoice by number and replace its lines. Guarded by X-Api-Key (env BP_API_KEY, default
 * matches app.json). Contract: _custom/README.md ("What this app is made of").
 */
class ApiInvoiceController {

    static allowedMethods = [ingest: 'POST']

    AuthService authService

    @Transactional
    def ingest() {
        String provided = request.getHeader('X-Api-Key')
        String expected = System.getenv('BP_API_KEY') ?: 'bp-demo-key-CHANGE-ME'
        if (!provided || provided != expected) {
            response.status = 401
            render([error: 'invalid or missing X-Api-Key'] as JSON)
            return
        }

        def body = request.JSON
        if (!body?.invoice_number || !body?.customer?.email) {
            response.status = 400
            render([error: 'invoice_number and customer.email are required'] as JSON)
            return
        }

        // 1) upsert customer by email
        Customer cust = Customer.findByEmail(body.customer.email) ?: new Customer(email: body.customer.email)
        cust.name        = body.customer.name ?: cust.name ?: body.customer.email
        cust.contactName = body.customer.contact_name
        cust.address     = body.customer.address
        cust.city        = body.customer.city
        cust.country     = body.customer.country
        cust.save(failOnError: true)

        // 2) ensure a CUSTOMER login for that customer — idempotent, never recreated
        if (!AppUser.findByUsername(cust.email)) {
            new AppUser(username: cust.email, passwordHash: authService.hash('changeme'),
                        role: 'CUSTOMER', customer: cust).save(failOnError: true)
        }

        // 3) upsert invoice by number, replace its lines
        Invoice inv = Invoice.findByInvoiceNumber(body.invoice_number) ?: new Invoice(invoiceNumber: body.invoice_number)
        inv.customer    = cust
        inv.invoiceDate = parseDate(body.invoice_date)
        inv.dueDate     = parseDate(body.due_date)
        inv.status      = (body.status ?: 'DUE').toString().toUpperCase()
        inv.subtotal    = toDec(body.subtotal)
        inv.tax         = toDec(body.tax)
        inv.freight     = toDec(body.freight)
        inv.total       = toDec(body.total)
        inv.notes       = body.notes
        // Honour a pushed pay token so the "Pay this invoice" link DataPallas emailed addresses this
        // very row. Falls back to a generated one when the push omits it (hand-made invoices, other
        // clients), and never blanks an existing token.
        inv.payToken    = body.pay_token ?: (inv.payToken ?: UUID.randomUUID().toString())
        if (inv.id && inv.lines) { new ArrayList(inv.lines).each { inv.removeFromLines(it); it.delete() } }
        body.lines?.each { l ->
            BigDecimal q  = toDec(l.qty)
            BigDecimal up = toDec(l.unit_price)
            BigDecimal d  = toDec(l.discount)
            inv.addToLines(new InvoiceLine(productName: l.product_name, category: l.category,
                    qty: (l.qty ?: 0) as Integer,
                    unitPrice: up, discount: d, lineTotal: q * up * (1.0G - d)))
        }
        inv.save(failOnError: true)

        render([ok: true, invoice: inv.invoiceNumber] as JSON)
    }

    private static BigDecimal toDec(v) { v == null ? 0.0G : new BigDecimal(v.toString()) }

    private static Date parseDate(String s) {
        if (!s) return new Date()
        try {
            return Date.from(LocalDate.parse(s).atStartOfDay(ZoneId.systemDefault()).toInstant())
        } catch (Exception ignored) {
            return new Date()
        }
    }
}

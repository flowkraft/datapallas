package com.flowkraft

/**
 * Seeds the billing portal demo data ON FIRST BOOT ONLY (when there are no users yet), so the
 * app looks populated immediately AND a DataPallas Burst's pushed invoices survive a restart.
 * The four accounts + their invoices are the deterministic contract used by apps-custom.spec.ts
 * (see _custom/README.md "Pre-known logins"): admin/admin123, alice/bob/carol@demo.io / demo1234.
 */
class BootStrap {

    AuthService authService

    def init = { servletContext ->
        AppUser.withTransaction {
            if (AppUser.count() > 0) {
                log.info 'Billing portal already seeded — leaving data as-is'
                return
            }
            log.info 'Seeding billing portal demo data...'

            new AppUser(username: 'admin', passwordHash: authService.hash('admin123'), role: 'ADMIN')
                    .save(failOnError: true)

            def alice = new Customer(name: 'Alice Anderson', email: 'alice@demo.io', city: 'Berlin', country: 'DE').save(failOnError: true)
            def bob   = new Customer(name: 'Bob Brown',      email: 'bob@demo.io',   city: 'Austin', country: 'US').save(failOnError: true)
            def carol = new Customer(name: 'Carol Clarke',   email: 'carol@demo.io', city: 'Leeds',  country: 'GB').save(failOnError: true)

            [alice, bob, carol].each { c ->
                new AppUser(username: c.email, passwordHash: authService.hash('demo1234'),
                            role: 'CUSTOMER', customer: c).save(failOnError: true)
            }

            // Deterministic invoices per the CONTRACTS §4 table.
            seedInvoice(alice, 'INV-DEMO-0001', 'PAID',    -40, -10)
            seedInvoice(alice, 'INV-DEMO-0002', 'OVERDUE', -20,  -5)
            seedInvoice(bob,   'INV-DEMO-0003', 'DUE',      -5,  25)
            seedInvoice(carol, 'INV-DEMO-0004', 'PAID',   -30,   0)
            // A DUE invoice with a fixed pay token — drives the unauthenticated-pay E2E test.
            seedInvoice(carol, 'INV-DEMO-0005', 'DUE',      -3,  27, 'demo-pay-token-0005')
            // A DUE invoice already PAST its due date — the billing-portal-bkend cron flips it to OVERDUE.
            seedInvoice(bob,   'INV-DEMO-0006', 'DUE',     -10,  -2)

            log.info 'Billing portal demo data seeded (1 admin, 3 customers, 6 invoices)'
        }
    }

    private void seedInvoice(Customer c, String number, String status, int issueOffset, int dueOffset, String token = null) {
        def inv = new Invoice(invoiceNumber: number, customer: c, status: status, payToken: token,
                invoiceDate: daysOffset(issueOffset), dueDate: daysOffset(dueOffset),
                subtotal: 1200.0G, tax: 96.0G, freight: 15.0G, total: 1311.0G)
        inv.addToLines(new InvoiceLine(productName: 'Managed Services — Monthly Retainer', qty: 2, unitPrice: 500.0G, discount: 0.0G, lineTotal: 1000.0G))
        inv.addToLines(new InvoiceLine(productName: 'Enterprise Software License',         qty: 1, unitPrice: 200.0G, discount: 0.0G, lineTotal: 200.0G))
        inv.save(failOnError: true)
    }

    private static Date daysOffset(int n) { new Date(System.currentTimeMillis() + (long) n * 86400000L) }

    def destroy = {}
}

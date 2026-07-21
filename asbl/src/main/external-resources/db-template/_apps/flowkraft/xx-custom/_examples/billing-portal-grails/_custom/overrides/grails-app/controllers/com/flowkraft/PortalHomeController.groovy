package com.flowkraft

/** Customer portal landing — a summary of the logged-in customer's invoices. */
class PortalHomeController {

    static layout = 'portal'

    def index() {
        def cust = session.customerId ? Customer.get(session.customerId) : null
        def invoices = cust ? Invoice.findAllByCustomer(cust, [sort: 'dueDate', order: 'asc']) : []
        def outstanding = invoices.findAll { it.status != 'PAID' }.sum { it.total ?: 0.0G } ?: 0.0G
        [
            customer   : cust,
            invoices   : invoices,
            paidCount  : invoices.count { it.status == 'PAID' },
            dueCount   : invoices.count { it.status == 'DUE' },
            overdueCount: invoices.count { it.status == 'OVERDUE' },
            outstanding: outstanding
        ]
    }
}

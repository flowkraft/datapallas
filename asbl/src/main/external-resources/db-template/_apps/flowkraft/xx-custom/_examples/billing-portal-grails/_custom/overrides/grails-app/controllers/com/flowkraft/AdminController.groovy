package com.flowkraft

/** Admin dashboard — headline counts + recent invoices. */
class AdminController {

    static layout = 'admin'

    def index() {
        [
            invoiceCount : Invoice.count(),
            customerCount: Customer.count(),
            paidCount    : Invoice.countByStatus('PAID'),
            dueCount     : Invoice.countByStatus('DUE'),
            overdueCount : Invoice.countByStatus('OVERDUE'),
            recent       : Invoice.list(max: 8, sort: 'dateCreated', order: 'desc')
        ]
    }
}

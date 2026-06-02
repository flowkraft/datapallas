package com.flowkraft

class PortalInvoiceController {

    static layout = 'portal'

    private static Date daysOffset(int n) { new Date(System.currentTimeMillis() + (long)n * 86400000L) }

    private static List<MockInvoice> sampleInvoices() {
        [
            new MockInvoice(id: 1L, invoiceNumber: 'INV-2024-001', status: 'pending',
                issueDate: daysOffset(-30), dueDate: daysOffset(15),
                subtotal: 1100.00, taxRate: 13.64, taxAmount: 150.00, totalAmount: 1250.00),
            new MockInvoice(id: 2L, invoiceNumber: 'INV-2024-002', status: 'paid',
                issueDate: daysOffset(-60), dueDate: daysOffset(-30),
                subtotal: 750.00, taxRate: 16.73, taxAmount: 125.50, totalAmount: 875.50,
                paidAt: daysOffset(-25), paymentMethod: 'stripe'),
            new MockInvoice(id: 3L, invoiceNumber: 'INV-2024-003', status: 'overdue',
                issueDate: daysOffset(-45), dueDate: daysOffset(-10),
                subtotal: 2800.00, taxRate: 14.29, taxAmount: 400.00, totalAmount: 3200.00,
                notes: 'Q3 consulting services'),
        ]
    }

    def index() {
        [invoiceList: sampleInvoices()]
    }

    def show(Long id) {
        def invoice = sampleInvoices().find { it.id == id }
        if (!invoice) {
            flash.error = "Invoice not found"
            redirect action: 'index'
            return
        }
        [invoice: invoice]
    }

    def pay(Long id) {
        def invoice = sampleInvoices().find { it.id == id }
        if (!invoice) {
            flash.error = "Invoice not found"
            redirect action: 'index'
            return
        }
        if (!invoice.isPayable()) {
            flash.error = "This invoice cannot be paid"
            redirect action: 'show', id: invoice.id
            return
        }
        [invoice: invoice]
    }

    def download(Long id) {
        def invoice = sampleInvoices().find { it.id == id }
        if (!invoice) {
            flash.error = "Invoice not found"
            redirect action: 'index'
            return
        }
        flash.message = "PDF download will be implemented"
        redirect action: 'show', id: invoice.id
    }
}

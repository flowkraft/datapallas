package com.flowkraft

class MockInvoice {
    Long id
    String invoiceNumber
    String status
    Date issueDate
    Date dueDate
    BigDecimal subtotal = 0
    BigDecimal taxRate = 0
    BigDecimal taxAmount = 0
    BigDecimal discount = 0
    BigDecimal totalAmount
    String notes
    Date paidAt
    String paymentMethod

    String getStatusBadgeClass() {
        switch (status) {
            case 'paid':      return 'badge-success'
            case 'pending':   return 'badge-warning'
            case 'overdue':   return 'badge-error'
            case 'cancelled': return 'badge-ghost'
            default:          return 'badge-neutral'
        }
    }

    boolean isOverdue() { status == 'overdue' }
    boolean isPayable() { status in ['pending', 'overdue'] }

    String formatAmount(BigDecimal amount) {
        '$' + String.format('%,.2f', amount ?: BigDecimal.ZERO)
    }

    String getPaymentMethodDisplay() {
        switch (paymentMethod) {
            case 'stripe': return 'Credit Card (Stripe)'
            case 'paypal': return 'PayPal'
            default:       return paymentMethod ?: 'N/A'
        }
    }
}

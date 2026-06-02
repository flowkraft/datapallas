package com.flowkraft

class MockPayslip {
    Long id
    String payslipNumber
    String status
    Date payPeriodStart
    Date payPeriodEnd
    String employeeName
    String employeeEmail
    String employeeId
    String department
    BigDecimal grossAmount
    BigDecimal deductions = 0
    BigDecimal netAmount
    Date dateCreated

    String getStatusBadgeClass() {
        switch (status) {
            case 'sent':       return 'badge-info'
            case 'viewed':     return 'badge-primary'
            case 'downloaded': return 'badge-success'
            default:           return 'badge-neutral'
        }
    }

    String getPayPeriodFormatted() {
        new java.text.SimpleDateFormat('MMMM yyyy').format(payPeriodStart)
    }

    String formatAmount(BigDecimal amount) {
        '$' + String.format('%,.2f', amount ?: BigDecimal.ZERO)
    }
}

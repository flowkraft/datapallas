package com.flowkraft

class PortalPayslipController {

    static layout = 'portal'

    private static Date daysAgo(int n) { new Date(System.currentTimeMillis() - (long)n * 86400000L) }

    private static List<MockPayslip> samplePayslips() {
        [
            new MockPayslip(id: 1L, payslipNumber: 'PAY-2024-04', status: 'downloaded',
                employeeName: 'Jane Smith', employeeEmail: 'jane@example.com',
                employeeId: 'EMP-001', department: 'Engineering',
                payPeriodStart: new Date(124, 3, 1), payPeriodEnd: new Date(124, 3, 30),
                grossAmount: 5000.00, deductions: 1150.00, netAmount: 3850.00,
                dateCreated: daysAgo(45)),
            new MockPayslip(id: 2L, payslipNumber: 'PAY-2024-03', status: 'viewed',
                employeeName: 'Jane Smith', employeeEmail: 'jane@example.com',
                employeeId: 'EMP-001', department: 'Engineering',
                payPeriodStart: new Date(124, 2, 1), payPeriodEnd: new Date(124, 2, 31),
                grossAmount: 5000.00, deductions: 1150.00, netAmount: 3850.00,
                dateCreated: daysAgo(75)),
            new MockPayslip(id: 3L, payslipNumber: 'PAY-2024-02', status: 'sent',
                employeeName: 'Jane Smith', employeeEmail: 'jane@example.com',
                employeeId: 'EMP-001', department: 'Engineering',
                payPeriodStart: new Date(124, 1, 1), payPeriodEnd: new Date(124, 1, 29),
                grossAmount: 5000.00, deductions: 1150.00, netAmount: 3850.00,
                dateCreated: daysAgo(105)),
        ]
    }

    def index() {
        [payslipList: samplePayslips()]
    }

    def show(Long id) {
        def payslip = samplePayslips().find { it.id == id }
        if (!payslip) {
            flash.error = "Payslip not found"
            redirect action: 'index'
            return
        }
        [payslip: payslip]
    }

    def download(Long id) {
        def payslip = samplePayslips().find { it.id == id }
        if (!payslip) {
            flash.error = "Payslip not found"
            redirect action: 'index'
            return
        }
        flash.message = "PDF download will be implemented"
        redirect action: 'show', id: payslip.id
    }
}

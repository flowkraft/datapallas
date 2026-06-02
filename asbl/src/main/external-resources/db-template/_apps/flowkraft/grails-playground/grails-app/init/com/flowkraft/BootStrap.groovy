package com.flowkraft

import java.time.LocalDate
import java.time.ZoneId
import grails.gorm.transactions.Transactional

class BootStrap {

    def init = { servletContext ->
        log.info "Resetting sample data..."

        Setting.withTransaction { Setting.executeUpdate("delete from Setting") }
        Invoice.withTransaction { Invoice.executeUpdate("delete from Invoice") }
        Payslip.withTransaction { Payslip.executeUpdate("delete from Payslip") }

        Setting.withTransaction { createDefaultSettings() }
        Invoice.withTransaction { createSampleInvoices() }
        Payslip.withTransaction { createSamplePayslips() }

        log.info "Sample data initialization complete"
    }

    def destroy = {
    }

    private void createDefaultSettings() {
        // NOTE: the default theme is intentionally NOT seeded here. The app-wide
        // default lives in code (window.RB_DEFAULT_THEME in views/common/_themeInit.gsp).
        // The 'theme.color' setting is created only when a user explicitly picks a
        // theme, so it always represents a real user choice (never a factory default).

        // Company settings
        Setting.setValue('company.name', 'FlowKraft Inc.', 'company', 'Company name')
        Setting.setValue('company.email', 'contact@flowkraft.com', 'company', 'Company email')
        Setting.setValue('company.phone', '+1 (555) 123-4567', 'company', 'Company phone')
        Setting.setValue('company.address', '123 Business Ave, Suite 100', 'company', 'Company address')
        
        // Preferences
        Setting.setValue('preferences.currency', 'USD', 'preferences', 'Default currency')
        Setting.setValue('preferences.dateFormat', 'MM/dd/yyyy', 'preferences', 'Date format')
        Setting.setValue('preferences.timezone', 'America/New_York', 'preferences', 'Default timezone')
        Setting.setValue('preferences.itemsPerPage', '10', 'preferences', 'Items per page')
        
        log.info "Created default settings"
    }

    private void createSampleInvoices() {
        def today = new Date()
        def random = new Random()

        // Create 10 sample invoices with various statuses
        def customers = [
            [name: "Acme Corporation", email: "billing@acme.com", id: "CUST-001"],
            [name: "TechStart Inc", email: "accounts@techstart.io", id: "CUST-002"],
            [name: "Global Solutions Ltd", email: "finance@globalsolutions.com", id: "CUST-003"],
            [name: "Innovation Labs", email: "billing@innovationlabs.com", id: "CUST-004"],
            [name: "Digital Ventures", email: "payments@digitalventures.net", id: "CUST-005"]
        ]

        def statuses = ["draft", "sent", "paid", "overdue", "cancelled"]
        def paymentMethods = ["stripe", "paypal", "bank_transfer", null]

        10.times { i ->
            def customer = customers[i % customers.size()]
            def status = i < 3 ? "draft" : i < 8 ? "sent" : i < 12 ? "paid" : i < 14 ? "overdue" : "cancelled"
            
            def issueDate = use(groovy.time.TimeCategory) {
                today - (30 - i * 2).days
            }
            
            def dueDate = use(groovy.time.TimeCategory) {
                issueDate + 30.days
            }

            def subtotal = 1000.0 + random.nextInt(9000)
            def taxRate = 10.0
            def taxAmount = subtotal * (taxRate / 100)
            def discount = i % 3 == 0 ? subtotal * 0.05 : 0
            def totalAmount = subtotal + taxAmount - discount

            def invoice = new Invoice(
                invoiceNumber: "INV-2026-${String.format('%06d', i + 1)}",
                customerId: customer.id,
                customerName: customer.name,
                customerEmail: customer.email,
                customerAddress: "${random.nextInt(999) + 1} ${['Main', 'Oak', 'Elm', 'Park'][random.nextInt(4)]} St",
                issueDate: issueDate,
                dueDate: dueDate,
                subtotal: subtotal,
                taxRate: taxRate,
                taxAmount: taxAmount,
                discount: discount,
                totalAmount: totalAmount,
                currency: "USD",
                status: status,
                notes: i % 2 == 0 ? "Thank you for your business!" : null
            )

            if (status == "paid") {
                invoice.paymentMethod = paymentMethods[random.nextInt(3)]
                invoice.paymentReference = "PAY-${System.currentTimeMillis()}-${i}"
                invoice.paidAt = use(groovy.time.TimeCategory) {
                    issueDate + (random.nextInt(25) + 1).days
                }
            }

            invoice.save(flush: true, failOnError: true)
            log.info "Created invoice: ${invoice.invoiceNumber} - ${invoice.status}"
        }
    }

    private void createSamplePayslips() {
        def today = new Date()
        def random = new Random()

        // Create 10 sample payslips with various statuses
        def employees = [
            [name: "John Smith", id: "EMP-001", dept: "Engineering", email: "john.smith@company.com"],
            [name: "Sarah Johnson", id: "EMP-002", dept: "Marketing", email: "sarah.johnson@company.com"],
            [name: "Michael Brown", id: "EMP-003", dept: "Sales", email: "michael.brown@company.com"],
            [name: "Emily Davis", id: "EMP-004", dept: "HR", email: "emily.davis@company.com"],
            [name: "David Wilson", id: "EMP-005", dept: "Finance", email: "david.wilson@company.com"]
        ]

        def statuses = ["draft", "sent", "viewed", "downloaded"]

        10.times { i ->
            def employee = employees[i % employees.size()]
            def status = i < 3 ? "draft" : i < 8 ? "sent" : i < 12 ? "viewed" : "downloaded"
            
            def periodStart = use(groovy.time.TimeCategory) {
                today - (60 - i * 4).days
            }
            
            def periodEnd = use(groovy.time.TimeCategory) {
                periodStart + 30.days
            }

            def grossAmount = 4000.0 + random.nextInt(4000)
            def deductions = grossAmount * 0.20 + (random.nextInt(100) + 50)
            def netAmount = grossAmount - deductions

            def payslip = new Payslip(
                payslipNumber: "PS-2026-${String.format('%06d', i + 1)}",
                employeeId: employee.id,
                employeeName: employee.name,
                employeeEmail: employee.email,
                department: employee.dept,
                payPeriodStart: periodStart,
                payPeriodEnd: periodEnd,
                grossAmount: grossAmount,
                deductions: deductions,
                netAmount: netAmount,
                currency: "USD",
                status: status
            )

            payslip.save(flush: true, failOnError: true)
            log.info "Created payslip: ${payslip.payslipNumber} - ${payslip.status}"
        }
    }
}
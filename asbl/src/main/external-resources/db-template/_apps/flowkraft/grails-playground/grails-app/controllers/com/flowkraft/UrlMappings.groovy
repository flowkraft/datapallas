package com.flowkraft

/**
 * URL Mappings for FlowKraft Unified App
 * 
 * Routes:
 * - /                   -> Home with component grid
 * - /tabulator          -> Tabulator data tables demo
 * - /charts             -> Charts demo
 * - /pivot-tables       -> Pivot tables demo
 * - /report-parameters  -> Report parameters demo
 * - /reports            -> Reports demo
 * - /data-warehouse     -> Northwind Data Warehouse OLAP (Browser/DuckDB/ClickHouse)
 * - /your-canvas        -> Build your own
 * - /admin/*            -> Admin panel
 * - /payment/*          -> Payment API endpoints
 * - /portal/payslips/*  -> Customer portal payslip views
 * - /portal/invoices/*  -> Customer portal invoice views
 */
class UrlMappings {

    static mappings = {
        
        // ===== MAIN APP ROUTES (matches Next.js exactly) =====
        
        // Home page - matches Next.js /
        "/"(controller: 'home', action: 'index')
        
        // Component demos - matches Next.js URLs exactly
        "/tabulator"(controller: 'tabulator', action: 'index')
        "/charts"(controller: 'charts', action: 'index')
        "/pivot-tables"(controller: 'pivotTables', action: 'index')
        "/report-parameters"(controller: 'reportParameters', action: 'index')
        "/reports"(controller: 'reports', action: 'index')
        "/data-warehouse"(controller: 'dataWarehouse', action: 'index')
        "/data-warehouse/browser"(controller: 'dataWarehouse', action: 'browser')
        "/data-warehouse/duckdb"(controller: 'dataWarehouse', action: 'duckdb')
        "/data-warehouse/clickhouse"(controller: 'dataWarehouse', action: 'clickhouse')
        "/dashboards"(controller: 'dashboards', action: 'index')
        "/your-canvas"(controller: 'yourCanvas', action: 'index')
        
        // ===== PORTAL ROUTES =====

        // Portal landing
        "/portal"(controller: 'portalHome', action: 'index')

        // Customer payslip portal
        "/portal/payslips"(controller: 'portalPayslip', action: 'index')
        "/portal/payslips/$id"(controller: 'portalPayslip', action: 'show')
        "/portal/payslips/$id/download"(controller: 'portalPayslip', action: 'download')

        // Customer invoice portal
        "/portal/invoices"(controller: 'portalInvoice', action: 'index')
        "/portal/invoices/$id"(controller: 'portalInvoice', action: 'show')
        "/portal/invoices/$id/pay"(controller: 'portalInvoice', action: 'pay')
        "/portal/invoices/$id/download"(controller: 'portalInvoice', action: 'download')
        
        // ===== ADMIN ROUTES =====
        
        // Admin dashboard
        "/admin"(controller: 'admin', action: 'index')
        "/admin/"(controller: 'admin', action: 'index')
        "/admin/settings"(controller: 'admin', action: 'settings')
        "/admin/settings/save"(controller: 'admin', action: 'saveSettings')
        
        // Admin payslip management
        "/admin/payslips"(controller: 'payslip', action: 'index')
        "/admin/payslips/create"(controller: 'payslip', action: 'create')
        "/admin/payslips/save"(controller: 'payslip', action: 'save')
        "/admin/payslips/$id"(controller: 'payslip', action: 'show')
        "/admin/payslips/$id/edit"(controller: 'payslip', action: 'edit')
        "/admin/payslips/$id/update"(controller: 'payslip', action: 'update')
        "/admin/payslips/$id/delete"(controller: 'payslip', action: 'delete')
        "/admin/payslips/$id/send"(controller: 'payslip', action: 'send')
        "/admin/payslips/$id/download"(controller: 'payslip', action: 'download')
        
        // Admin invoice management
        "/admin/invoices"(controller: 'invoice', action: 'index')
        "/admin/invoices/create"(controller: 'invoice', action: 'create')
        "/admin/invoices/save"(controller: 'invoice', action: 'save')
        "/admin/invoices/checkOverdue"(controller: 'invoice', action: 'checkOverdue')
        "/admin/invoices/$id"(controller: 'invoice', action: 'show')
        "/admin/invoices/$id/edit"(controller: 'invoice', action: 'edit')
        "/admin/invoices/$id/update"(controller: 'invoice', action: 'update')
        "/admin/invoices/$id/delete"(controller: 'invoice', action: 'delete')
        "/admin/invoices/$id/send"(controller: 'invoice', action: 'send')
        "/admin/invoices/$id/markPaid"(controller: 'invoice', action: 'markPaid')
        "/admin/invoices/$id/cancel"(controller: 'invoice', action: 'cancel')
        "/admin/invoices/$id/download"(controller: 'invoice', action: 'download')
        
        // ===== PAYMENT API ROUTES =====
        
        // Stripe payments
        "/payment/stripe/create-intent"(controller: 'payment', action: 'createStripeIntent')
        "/payment/stripe/confirm"(controller: 'payment', action: 'confirmStripePayment')
        "/payment/stripe/status/$id"(controller: 'payment', action: 'stripeStatus')
        
        // PayPal payments
        "/payment/paypal/create-order"(controller: 'payment', action: 'createPayPalOrder')
        "/payment/paypal/capture-order"(controller: 'payment', action: 'capturePayPalOrder')
        "/payment/paypal/success"(controller: 'payment', action: 'paypalSuccess')
        "/payment/paypal/cancel"(controller: 'payment', action: 'paypalCancel')
        "/payment/paypal/status/$id"(controller: 'payment', action: 'paypalStatus')
        
        // ===== DEFAULT GRAILS ROUTES =====
        
        // Standard controller/action mapping
        "/$controller/$action?/$id?(.$format)?" {
            constraints {
                // Exclude static assets
            }
        }
        
        // Error pages
        "500"(view: '/error')
        "404"(view: '/notFound')
    }
}

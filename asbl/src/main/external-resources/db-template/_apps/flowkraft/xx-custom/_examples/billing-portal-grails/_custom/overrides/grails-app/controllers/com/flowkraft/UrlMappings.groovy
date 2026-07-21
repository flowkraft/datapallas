package com.flowkraft

/**
 * Billing-portal routes. Root goes to the customer portal; /admin is the CRUD backend;
 * POST /api/invoices is the REST endpoint DataPallas pushes to; /portal/pay is the
 * unauthenticated token pay link.
 */
class UrlMappings {

    static mappings = {

        // ===== ROOT =====
        "/"(controller: 'portalHome', action: 'index')

        // ===== AUTH =====
        "/login"(controller: 'login', action: 'index')
        "/login/authenticate"(controller: 'login', action: 'authenticate')
        "/logout"(controller: 'login', action: 'logout')

        // ===== CUSTOMER PORTAL =====
        "/portal"(controller: 'portalHome', action: 'index')
        "/portal/invoices"(controller: 'portalInvoice', action: 'index')
        "/portal/invoices/$id"(controller: 'portalInvoice', action: 'show')
        "/portal/invoices/$id/pay"(controller: 'portalInvoice', action: 'pay')
        "/portal/pay"(controller: 'portalInvoice', action: 'payByToken')   // unauthenticated, ?token=...

        // ===== ADMIN (CRUD) =====
        "/admin"(controller: 'admin', action: 'index')
        "/admin/"(controller: 'admin', action: 'index')
        "/admin/invoices"(controller: 'invoice', action: 'index')
        // '/new', not '/create', to mirror the Next portal's app/(admin)/admin/invoices/new — the two
        // stacks expose the SAME urls + ids so the e2e CRUD body is shared verbatim. Must stay ABOVE
        // the /$id mapping below, or 'new' is swallowed as an invoice id and renders show().
        "/admin/invoices/new"(controller: 'invoice', action: 'create')
        "/admin/invoices/save"(controller: 'invoice', action: 'save')
        "/admin/invoices/$id"(controller: 'invoice', action: 'show')
        "/admin/invoices/$id/edit"(controller: 'invoice', action: 'edit')
        "/admin/invoices/$id/update"(controller: 'invoice', action: 'update')
        "/admin/invoices/$id/delete"(controller: 'invoice', action: 'delete')
        "/admin/invoices/$id/markPaid"(controller: 'invoice', action: 'markPaid')
        "/admin/customers"(controller: 'customer', action: 'index')
        "/admin/customers/search"(controller: 'customer', action: 'search')   // JSON for the picker modal
        // '/new', not '/create', and ABOVE the /$id mapping — for both of the reasons the invoice
        // block above spells out.
        "/admin/customers/new"(controller: 'customer', action: 'create')
        "/admin/customers/save"(controller: 'customer', action: 'save')
        "/admin/customers/$id"(controller: 'customer', action: 'show')
        "/admin/customers/$id/edit"(controller: 'customer', action: 'edit')
        "/admin/customers/$id/update"(controller: 'customer', action: 'update')
        "/admin/customers/$id/delete"(controller: 'customer', action: 'delete')
        "/admin/customers/$id/resetPassword"(controller: 'customer', action: 'resetPassword')

        // ===== REST API (DataPallas → portal): POST creates/updates an invoice =====
        "/api/invoices"(controller: 'apiInvoice', action: 'ingest')

        // ===== PAYMENT GATEWAY API (Stripe / PayPal — live only when keys are configured) =====
        "/payment/stripe/create-intent"(controller: 'payment', action: 'createStripeIntent')
        "/payment/stripe/confirm"(controller: 'payment', action: 'confirmStripePayment')
        "/payment/stripe/status/$id"(controller: 'payment', action: 'stripeStatus')
        "/payment/paypal/create-order"(controller: 'payment', action: 'createPayPalOrder')
        "/payment/paypal/capture-order"(controller: 'payment', action: 'capturePayPalOrder')
        "/payment/paypal/status/$id"(controller: 'payment', action: 'paypalStatus')

        // ===== DEFAULTS =====
        "/$controller/$action?/$id?(.$format)?" { }
        "500"(view: '/error')
        "404"(view: '/notFound')
    }
}

package com.flowkraft

import grails.gorm.transactions.Transactional

/**
 * Picks the payment gateway at runtime. A real gateway is "enabled" only when its keys are set in
 * the environment; otherwise the portal uses a SIMULATED settle so the demo (and the 0015 video /
 * apps-custom.spec.ts) work with zero config. The real Stripe/PayPal integration (StripeService,
 * PayPalService, PaymentController) is kept and used when keys are present — payment is a first-class
 * billing-portal feature, never stripped.
 *
 * @Transactional is REQUIRED, not decorative: settleSimulated() calls invoice.save(flush: true), and
 * Grails 3+ services are NOT transactional by default (unlike Grails 2). Without it, paying an invoice
 * blows up with "jakarta.persistence.TransactionRequiredException: no transaction is in progress" —
 * a 500 that the portal's error.gsp renders as a bland "Something went wrong".
 */
@Transactional
class PaymentGatewayService {

    boolean stripeEnabled() {
        String k = System.getenv('STRIPE_SECRET_KEY')
        k && !k.isBlank() && k != 'sk_test_placeholder'
    }

    String stripePublishableKey() { System.getenv('STRIPE_PUBLISHABLE_KEY') ?: '' }

    boolean payPalEnabled() {
        String id = System.getenv('PAYPAL_CLIENT_ID')
        id && !id.isBlank()
    }

    boolean anyRealGateway() { stripeEnabled() || payPalEnabled() }

    /**
     * Simulated settle — marks the invoice paid with no external gateway (demo default).
     *
     * failOnError is deliberate: a bare save(flush: true) returns NULL and persists NOTHING when
     * validation fails, so the pay page happily rendered "Payment complete" while the invoice stayed
     * DUE and the log showed zero errors. Never let a settle fail silently.
     */
    def settleSimulated(Invoice invoice) {
        if (invoice?.isPayable()) {
            invoice.markAsPaid('demo', 'SIM-' + UUID.randomUUID().toString().take(12))
            invoice.save(flush: true, failOnError: true)
        }
    }
}

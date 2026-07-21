package com.flowkraft

/**
 * Session gate. /admin/** (admin, invoice, customer controllers) requires an ADMIN session;
 * /portal (portalHome + authenticated portalInvoice actions) requires any logged-in user.
 * Public: login, the REST ingest (its own X-Api-Key check), and the unauthenticated token pay.
 *
 * DENY BY DEFAULT. A controller this file does not name is refused, not waved through — see the
 * bottom of before(). It used to end in `return true`, and that fail-open default is not a
 * hypothetical: the app is scaffolded by copying the whole playground and deleting what it does not
 * need, so any controller the strip list forgets stays live AND unlisted here. SettingsController was
 * exactly that — anonymous read/write of the settings table via the catch-all URL mapping, purely
 * because nobody had thought to name it. Deny-by-default turns the next such oversight into a
 * redirect to /login instead of an open endpoint.
 */
class AuthInterceptor {

    AuthInterceptor() {
        matchAll()
    }

    boolean before() {
        // Always-public controllers/actions.
        if (controllerName in ['login', 'apiInvoice', 'payment']) return true
        if (controllerName == 'portalInvoice' && actionName == 'payByToken') return true

        // Admin area — ADMIN only.
        if (controllerName in ['admin', 'invoice', 'customer']) {
            if (session.role == 'ADMIN') return true
            flash.notice = 'Please sign in as an administrator'
            redirect(uri: '/login')
            return false
        }

        // Customer portal — any logged-in user.
        if (controllerName in ['portalHome', 'portalInvoice']) {
            if (session.userId) return true
            flash.notice = 'Please sign in to view your account'
            redirect(uri: '/login')
            return false
        }

        // Anything else is refused. Add a controller to one of the lists above to publish it — that
        // is deliberately a decision someone has to make, rather than the default for every class
        // that happens to end in "Controller".
        flash.notice = 'Please sign in'
        redirect(uri: '/login')
        return false
    }

    boolean after() { true }

    void afterView() {}
}

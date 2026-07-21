package com.flowkraft

import grails.gorm.transactions.Transactional

/** Admin CRUD over customers + their invoices, and the delete that retires one. */
class CustomerController {

    static layout = 'admin'

    static allowedMethods = [save: 'POST', update: 'POST', delete: 'POST', resetPassword: 'POST']

    static final int PAGE_SIZE = 10

    /** All the admin form demands of a customer; the domain's constraints enforce the rest. */
    private static final String INVALID_CUSTOMER = 'Please provide a customer name and a valid email address'

    AuthService authService

    // Paginated + searchable customer list (by name or email) — scales past thousands of customers.
    def index() {
        String q = (params.q ?: '').toString().trim()
        def args = [:]
        String where = ''
        if (q) { where = 'where lower(c.name) like :q or lower(c.email) like :q'; args.q = '%' + q.toLowerCase() + '%' }
        int total = (Customer.executeQuery("select count(c) from Customer c ${where}".toString(), args)[0]) as int
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) PAGE_SIZE))
        int page = Math.min(Math.max(1, params.int('page') ?: 1), totalPages)
        def customerList = Customer.executeQuery("select c from Customer c ${where} order by c.name".toString(),
                args, [max: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE])
        [customerList: customerList, customerCount: total, page: page, totalPages: totalPages, q: q]
    }

    def show(Long id) {
        def customer = Customer.get(id)
        if (!customer) { flash.error = 'Customer not found'; redirect(action: 'index'); return }
        [customer: customer, invoices: Invoice.findAllByCustomer(customer, [sort: 'dueDate', order: 'asc'])]
    }

    def create() {
        [customer: new Customer()]
    }

    /**
     * Add a customer AND the CUSTOMER login that lets them into the portal — username = email,
     * password `changeme`: exactly the pair ApiInvoiceController.ingest creates for a pushed
     * customer, so one entered by hand signs in the same way.
     */
    @Transactional
    def save() {
        def customer = new Customer(customerParams())
        customer.email = params.email?.trim()      // settable ONCE, here — see customerParams()
        String name = customer.name
        String email = customer.email
        if (!valid(customer)) { reject(customer, 'create', INVALID_CUSTOMER); return }
        // Refused, never upserted: the admin means to ADD someone, and silently rewriting whoever
        // already holds this email instead is not that.
        if (Customer.findByEmail(email)) { reject(customer, 'create', "A customer with email ${email} already exists"); return }
        if (!customer.save(flush: true)) { reject(customer, 'create', INVALID_CUSTOMER); return }
        new AppUser(username: email, passwordHash: authService.hash('changeme'),
                    role: 'CUSTOMER', customer: customer).save(flush: true)
        flash.message = "Customer ${name} created"
        redirect(action: 'show', id: customer.id)
    }

    def edit(Long id) {
        def customer = Customer.get(id)
        if (!customer) { flash.error = 'Customer not found'; redirect(action: 'index'); return }
        [customer: customer]
    }

    /**
     * Save the editable fields. The email is NOT one of them — it is the REST upsert key AND the
     * login username, so rewriting it here would make the next Burst miss this customer and create a
     * DUPLICATE under the old address, stranding the login. edit.gsp renders it readonly and this
     * ignores the submitted field outright: a readonly input is still posted, and still forgeable.
     */
    @Transactional
    def update(Long id) {
        def customer = Customer.get(id)
        if (!customer) { flash.error = 'Customer not found'; redirect(action: 'index'); return }
        customer.properties = customerParams()
        String name = customer.name
        if (!valid(customer) || !customer.save(flush: true)) {
            // Detach before rendering: the assignment above already made this instance dirty, so
            // without a discard the transaction's flush would write the refused values anyway.
            customer.discard()
            reject(customer, 'edit', INVALID_CUSTOMER)
            return
        }
        flash.message = "Customer ${name} updated"
        redirect(action: 'show', id: customer.id)
    }

    /** Put this customer's login back to `changeme` — the password a pushed customer starts with. */
    @Transactional
    def resetPassword(Long id) {
        def customer = Customer.get(id)
        if (!customer) { flash.error = 'Customer not found'; redirect(action: 'index'); return }
        String email = customer.email
        AppUser user = AppUser.findByUsername(email)      // the username IS the email
        if (user) {
            user.passwordHash = authService.hash('changeme')
            user.save(flush: true)
        }
        flash.message = "Password for ${email} reset to changeme"
        redirect(action: 'show', id: customer.id)
    }

    /**
     * Retire a customer, from either the list or their detail page (both ask via _confirmDeleteCustomer.gsp).
     *
     * A customer who still has invoices is REFUSED and nothing is touched: their invoices are the
     * billing record, and deleting the customer would either take that record with them or strand it
     * against a customer who no longer exists. The admin deletes the invoices first, deliberately.
     *
     * Their login goes with them — it exists only to see this customer's invoices, and AppUser
     * carries the customer, so leaving it behind would break that reference. It is matched by
     * username, which IS the customer's email (ApiInvoiceController + BootStrap both create it that
     * way). The Next twin's deleteCustomer in lib/actions.ts refuses on the same rule, in the same
     * words.
     */
    @Transactional
    def delete(Long id) {
        def customer = Customer.get(id)
        if (customer) {
            def name = customer.name
            int invoices = Invoice.countByCustomer(customer)
            if (invoices > 0) {
                flash.error = "Customer ${name} has ${invoices} invoice(s) — delete those first"
                redirect(action: 'index')
                return
            }
            AppUser.findByUsername(customer.email)?.delete(flush: true)
            customer.delete(flush: true)
            flash.message = "Customer ${name} deleted"
        }
        redirect(action: 'index')
    }

    // JSON search for the invoice-form customer picker modal — paginated, so it scales to
    // thousands of customers without ever loading them all. Matches name or email.
    def search() {
        int max = 10
        String q = (params.q ?: '').toString().trim()
        def args = [:]
        String where = ''
        if (q) { where = 'where lower(c.name) like :q or lower(c.email) like :q'; args.q = '%' + q.toLowerCase() + '%' }
        int total = (Customer.executeQuery("select count(c) from Customer c ${where}".toString(), args)[0]) as int
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) max))
        int page = Math.min(Math.max(1, params.int('page') ?: 1), totalPages)
        def list = Customer.executeQuery("select c from Customer c ${where} order by c.name".toString(),
                args, [max: max, offset: (page - 1) * max])
        def result = [
            customers : list.collect { [id: it.id, name: it.name, email: it.email, city: it.city, country: it.country] },
            page      : page,
            totalPages: totalPages,
            total     : total,
        ]
        render(text: groovy.json.JsonOutput.toJson(result), contentType: 'application/json')
    }

    /** Hand the form back with what the admin typed still in it, plus why it was refused. */
    private void reject(Customer customer, String view, String message) {
        flash.error = message
        render(view: view, model: [customer: customer])
    }

    private static boolean valid(Customer customer) {
        customer.name?.trim() && customer.email?.trim()?.contains('@')
    }

    /**
     * The fields the admin form may write. Email is deliberately absent: save() sets it once, and
     * update() must never rewrite it.
     */
    private Map customerParams() {
        [
            name       : params.name?.trim(),
            contactName: params.contactName?.trim(),
            address    : params.address?.trim(),
            city       : params.city?.trim(),
            country    : params.country?.trim()
        ]
    }
}

package com.flowkraft

/**
 * A login account. role ∈ {ADMIN, CUSTOMER}. An ADMIN sees /admin (full CRUD); a CUSTOMER
 * is linked to one Customer and sees only their own invoices at /portal. Passwords are
 * BCrypt-hashed. CUSTOMER users are auto-created idempotently by the REST ingest (never
 * recreated for an existing username, regardless of age).
 * Table: bp_app_user.
 */
class AppUser {

    String username
    String passwordHash
    String role = 'CUSTOMER'
    Customer customer

    Date dateCreated
    Date lastUpdated

    static belongsTo = [customer: Customer]

    static constraints = {
        username blank: false, unique: true, maxSize: 160
        passwordHash blank: false, maxSize: 100
        role inList: ['ADMIN', 'CUSTOMER']
        customer nullable: true   // ADMIN has no linked Customer
    }

    static mapping = {
        table 'bp_app_user'
        passwordHash column: 'password_hash'
        dateCreated column: 'created_at'
        lastUpdated column: 'updated_at'
    }

    boolean isAdmin() { role == 'ADMIN' }

    String toString() { username }
}

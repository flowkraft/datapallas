package com.flowkraft

/**
 * A billing customer. Owned invoices hang off it; a CUSTOMER-role AppUser (created on
 * first REST ingest, idempotently) lets the customer log in to see only their invoices.
 * Table: bp_customer  (blueprint prefix — a derived app overrides the mapping to change it).
 */
class Customer {

    String name
    String contactName   // the invoice document's "Attn:" line
    String email
    String address       // the invoice document's street line
    String city
    String country

    Date dateCreated
    Date lastUpdated

    static hasMany = [invoices: Invoice]

    static constraints = {
        name blank: false, maxSize: 120
        contactName nullable: true, maxSize: 120
        email blank: false, unique: true, email: true, maxSize: 160
        address nullable: true, maxSize: 200
        city nullable: true, maxSize: 80
        country nullable: true, maxSize: 60
    }

    static mapping = {
        table 'bp_customer'
        contactName column: 'contact_name'
        dateCreated column: 'created_at'
        lastUpdated column: 'updated_at'
    }

    String toString() { name }
}

// ═══════════════════════════════════════════════════════════════════════════
// Customer Payments — what came in, and who paid it
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per payment, with the way it was paid, the invoice it
// settles and the customer it came from.
//
// Joins: cube_demo.erp_invoices on invoice_id, many_to_one, and through it
// cube_demo.erp_customers, many_to_one — a payment is booked against an invoice,
// and the customer is the invoice's. Both are LEFT joins, and neither multiplies
// anything, so Payments and Received keep their numbers whatever is ticked.
//
// Grain: one row per payment. Payments counts payments, Received adds up their
// amount. An invoice paid in three instalments is three rows here and one row in
// customer-invoices — which is why the two are separate cubes.
//
// What it can answer:
//   - how much came in and how (Payments, Received, Method);
//   - when (PaidDate, readable by day, week, month, quarter or year);
//   - from whom (Customer, Country, Customers) and against what (InvoiceId,
//     InvoiceNo).
//
// Data: cube_demo.erp_payments (1,700 payments against 1,613 of the 2,000
// invoices), cube_demo.erp_invoices (2,000) and cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.erp_payments'
  title 'Customer Payments'
  description 'What came in, how it was paid, and who paid it'

  join {
    name 'cube_demo.erp_invoices'
    title 'Invoices'
    description 'The invoice the payment settles'
    sql '${CUBE}.invoice_id = cube_demo.erp_invoices.invoice_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.erp_customers'
    title 'Customers'
    description 'The customer the payment came from'
    parent 'cube_demo.erp_invoices'
    sql 'cube_demo.erp_invoices.customer_id = cube_demo.erp_customers.customer_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'PaymentId'
    title 'Payment Id'
    description 'The payment number'
    sql '${CUBE}.payment_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'InvoiceId'
    title 'Invoice Id'
    description 'The invoice the payment is for'
    sql '${CUBE}.invoice_id'
    type 'number'
  }
  dimension {
    name 'Method'
    title 'Method'
    description 'Bank Transfer, Check, Credit Card or Direct Debit'
    sql '${CUBE}.method'
    type 'string'
  }
  dimension {
    name 'PaidDate'
    title 'Paid'
    description 'The day the payment came in'
    sql '${CUBE}.paid_date'
    type 'time'
  }

  dimension {
    name 'InvoiceNo'
    title 'Invoice No'
    description 'The invoice number as it is printed'
    sql 'cube_demo.erp_invoices.invoice_no'
    type 'string'
  }
  dimension {
    name 'Customer'
    title 'Customer'
    description 'The customer the payment came from'
    sql 'cube_demo.erp_customers.name'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the customer is in'
    sql 'cube_demo.erp_customers.country'
    type 'string'
  }

  measure {
    name 'Payments'
    title 'Payments'
    description 'How many payments there are'
    type 'count'
  }
  measure {
    name 'Received'
    title 'Received'
    description 'What came in, added up'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'Customers'
    title 'Customers'
    description 'How many different customers paid'
    sql 'cube_demo.erp_customers.customer_id'
    type 'count_distinct'
  }
}

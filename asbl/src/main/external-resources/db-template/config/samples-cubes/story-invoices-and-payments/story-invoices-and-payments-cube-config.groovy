// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 16 — Invoices & Payments
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "what did we invoice, by status, and what came in, by payment
// method?"
// Who asks it: the accountant closing the month.
//
// What the cube does here: two related cubes in one file. The picker lists
// Invoices and Payments; switching from one to the other clears the ticks and
// the SQL, and each cube reads its own table. The customers cube in the same
// file is not public, so it is not in the picker: it is there for the two to
// join to.
//
// Data: cube_demo.erp_invoices (2,000), cube_demo.erp_payments (1,700),
// cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube('invoices') {
  sql_table 'cube_demo.erp_invoices'
  title 'Invoices'
  description 'What was invoiced, and where each invoice stands'

  join {
    name 'cube_demo.erp_customers'
    title 'Customers'
    description 'The customer the invoice was sent to'
    sql '${CUBE}.customer_id = cube_demo.erp_customers.customer_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'InvoiceId'
    title 'Invoice Id'
    description 'The invoice number'
    sql '${CUBE}.invoice_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'InvoiceNo'
    title 'Invoice No'
    description 'The invoice number as it is printed'
    sql '${CUBE}.invoice_no'
    type 'string'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Paid, Open or Overdue'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'IssueDate'
    title 'Issued'
    description 'The day the invoice was issued'
    sql '${CUBE}.issue_date'
    type 'time'
  }
  dimension {
    name 'DueDate'
    title 'Due'
    description 'The day the invoice is due'
    sql '${CUBE}.due_date'
    type 'time'
  }
  dimension {
    name 'Customer'
    title 'Customer'
    description 'The customer the invoice was sent to'
    sql 'cube_demo.erp_customers.name'
    type 'string'
  }

  measure {
    name 'Invoices'
    title 'Invoices'
    description 'How many invoices there are'
    type 'count'
  }
  measure {
    name 'Invoiced'
    title 'Invoiced'
    description 'What was invoiced, added up'
    sql '${CUBE}.total_amount'
    type 'sum'
    format 'currency'
  }
}

cube('payments') {
  sql_table 'cube_demo.erp_payments'
  title 'Payments'
  description 'What came in, and how it was paid'

  dimension {
    name 'PaymentId'
    title 'Payment Id'
    description 'The payment number'
    sql '${CUBE}.payment_id'
    type 'number'
    primary_key true
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
}

cube('cube_demo.erp_customers') {
  sql_table 'cube_demo.erp_customers'
  title 'Customers'
  description 'The customers the invoices are sent to. Not in the picker: it is here to be joined to'
  public_ false

  dimension {
    name 'CustomerId'
    title 'Customer Id'
    description 'The customer number'
    sql '${CUBE}.customer_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Customer'
    title 'Customer'
    description 'The customer name'
    sql '${CUBE}.name'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the customer is in'
    sql '${CUBE}.country'
    type 'string'
  }

  measure {
    name 'Customers'
    title 'Customers'
    description 'How many customers there are'
    type 'count'
  }
}

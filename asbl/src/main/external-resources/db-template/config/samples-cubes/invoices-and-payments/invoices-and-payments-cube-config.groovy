// ═══════════════════════════════════════════════════════════════════════════
// Invoices & Payments — the finance desk
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: three cubes. Invoices is what was sent out, line by line when
// you ask for it; Payments is what came in; Customers is the customer list the
// other two join to, and is not in the picker.
//
// Grain: one row per invoice, one row per payment, one row per customer.
// Invoices counts invoices, not invoice lines: ticking Item brings the lines in,
// and the total still answers 2,000 invoices and 20,411,515.04 invoiced.
//
// Joins (Invoices): cube_demo.erp_customers on customer_id (many_to_one) and
// cube_demo.erp_invoice_lines on invoice_id (one_to_many). A join is only
// written when one of its columns is asked for, and a one-to-many total goes
// through the two-stage SQL that counts each invoice once, so the lines cannot
// inflate Invoices or Invoiced.
//
// What they can answer:
//   - what was invoiced, by status, by customer, by country, by the day it was
//     issued or is due (Invoices, Invoiced, AvgInvoice), and the named filters
//     unpaid and overdue;
//   - what is on the invoices: which items, how many units, for how much
//     (Item, Units, LineAmount);
//   - what came in and how it was paid (Payments, Received, Method, PaidDate);
//   - and, with the customer in the same cube, who we invoice most, on what
//     terms and against what credit limit.
//
// Data: cube_demo.erp_invoices (2,000), cube_demo.erp_invoice_lines (5,500),
// cube_demo.erp_payments (1,700), cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube('invoices') {
  sql_table 'cube_demo.erp_invoices'
  title 'Invoices'
  description 'What was invoiced, to whom, and where each invoice stands'

  join {
    name 'cube_demo.erp_customers'
    title 'Customers'
    description 'The customer the invoice was sent to'
    sql '${CUBE}.customer_id = cube_demo.erp_customers.customer_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.erp_invoice_lines'
    title 'Invoice Lines'
    description 'The lines of the invoice'
    sql '${CUBE}.invoice_id = cube_demo.erp_invoice_lines.invoice_id'
    relationship 'one_to_many'
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
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the customer is in'
    sql 'cube_demo.erp_customers.country'
    type 'string'
  }
  dimension {
    name 'PaymentTermsDays'
    title 'Payment Terms (days)'
    description 'How many days the customer has to pay'
    sql 'cube_demo.erp_customers.payment_terms_days'
    type 'number'
  }
  dimension {
    name 'CreditLimit'
    title 'Credit Limit'
    description 'How much credit the customer is allowed'
    sql 'cube_demo.erp_customers.credit_limit'
    type 'number'
  }
  dimension {
    name 'Item'
    title 'Item'
    description 'The item on the invoice line'
    sql 'cube_demo.erp_invoice_lines.item'
    type 'string'
  }

  measure {
    name 'Invoices'
    title 'Invoices'
    description 'How many invoices there are. An invoice with five lines still counts once'
    type 'count'
  }
  measure {
    name 'Invoiced'
    title 'Invoiced'
    description 'What was invoiced, added up once per invoice'
    sql '${CUBE}.total_amount'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'AvgInvoice'
    title 'Average Invoice'
    description 'What an invoice is worth on average'
    sql '${CUBE}.total_amount'
    type 'avg'
    format 'currency'
  }
  measure {
    name 'LineAmount'
    title 'Line Amount'
    description 'What the invoice lines come to, added up'
    sql 'cube_demo.erp_invoice_lines.amount'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'Units'
    title 'Units'
    description 'How many units were invoiced'
    sql 'cube_demo.erp_invoice_lines.qty'
    type 'sum'
  }
  measure {
    name 'Customers'
    title 'Customers'
    description 'How many different customers were invoiced'
    sql '${CUBE}.customer_id'
    type 'count_distinct'
  }

  segment {
    name 'unpaid'
    title 'Not paid yet'
    description 'Invoices that are still Open or Overdue'
    sql "\${CUBE}.status <> 'Paid'"
  }
  segment {
    name 'overdue'
    title 'Overdue'
    description 'Invoices that are past their due date and still not paid'
    sql "\${CUBE}.status = 'Overdue'"
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

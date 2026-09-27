// ═══════════════════════════════════════════════════════════════════════════
// Customer Billing — two cubes in one file: what was invoiced, and what came in
// ═══════════════════════════════════════════════════════════════════════════
//
// A file can hold one cube, the way the other files in this folder do, or
// several, each under its own name: cube('customer-invoices') { ... }. This one
// holds the two cubes of billing, because they are read together, and each is
// still a cube of its own - its own id, title, hints and SQL. Whoever asks for
// one says which by its name (cubeName); a file of named cubes has no cube to
// fall back on, so a request that names none is refused with the names it has.
//
// Why two cubes and not one: an invoice and a payment are two business
// processes, each with its own grain. An invoice paid in three instalments is
// one invoice and three payments, and one cube over both would count one of
// them wrong.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Customer Invoices — what was invoiced and to whom
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per invoice, with the customer it was sent to and —
// through the invoice lines — what was on it.
//
// Joins: cube_demo.erp_customers on customer_id, many_to_one, and
// cube_demo.erp_invoice_lines on invoice_id, one_to_many. Both are LEFT joins,
// so an invoice with no lines yet still counts.
//
// Grain: one row per invoice. The one_to_many join to the lines repeats an
// invoice once per line, and the generator handles that by itself: Invoices and
// Invoiced are worked out once per invoice in a WITH, while LineAmount and Units
// are summed over the lines. Ticking Item brings the lines in, and the total
// still answers 2,000 invoices.
//
// What it can answer:
//   - how much was invoiced and where each invoice stands (Invoices, Invoiced,
//     AvgInvoice, Status, IssueDate, DueDate);
//   - to whom (Customer, Country, Customers, PaymentTermsDays, CreditLimit);
//   - what was on the invoice (Item, Units, LineAmount);
//   - the two questions worth asking on their own, with the unpaid and overdue
//     segments.
//
// What came in against these invoices is its own process, and its own cube:
// customer-payments, the next one in this file.
//
// Data: cube_demo.erp_invoices (2,000 invoices — 1,568 Paid, 373 Overdue,
// 59 Open), cube_demo.erp_invoice_lines (5,500) and cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube('customer-invoices') {
  sql_table 'cube_demo.erp_invoices'
  title 'Customer Invoices'
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
// customer-invoices, the cube above — which is why the two are separate cubes.
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

cube('customer-payments') {
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

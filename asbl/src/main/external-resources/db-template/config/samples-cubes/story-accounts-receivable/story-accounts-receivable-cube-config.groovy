// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 17 — Accounts Receivable
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "which invoices are still unpaid, how much is still due, and
// who owes us most?"
// Who asks it: the credit controller.
//
// What the cube does here: a cube built on your own SQL. The controller already
// had the query — the unpaid invoices, with what each one has been part paid
// subtracted — so the cube reads that query instead of a table, and everything
// else works as usual on top of it.
//
// The 432 unpaid invoices were invoiced 4,300,810.66 but only 4,096,696.09 is
// still due: 45 of them are part paid, which is what the LEFT JOIN is for.
//
// The second cube in this file reads the invoices table directly, under the
// short name inv.
//
// Data: cube_demo.erp_invoices (2,000), cube_demo.erp_payments (1,700),
// cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql '''SELECT i.invoice_id, i.invoice_no, c.name AS customer, i.status, i.due_date,
         i.total_amount - COALESCE(p.paid, 0) AS balance_due
  FROM cube_demo.erp_invoices i
  JOIN cube_demo.erp_customers c ON c.customer_id = i.customer_id
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid
             FROM cube_demo.erp_payments GROUP BY invoice_id) p
    ON p.invoice_id = i.invoice_id
  WHERE i.status <> 'Paid' '''
  title 'Accounts Receivable'
  description 'The invoices that are not paid yet, and what is still due on each'

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
    name 'Customer'
    title 'Customer'
    description 'The customer who owes it'
    sql '${CUBE}.customer'
    type 'string'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Open or Overdue'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'DueDate'
    title 'Due'
    description 'The day the invoice was due'
    sql '${CUBE}.due_date'
    type 'time'
  }

  measure {
    name 'Invoices'
    title 'Invoices'
    description 'How many invoices are still unpaid'
    type 'count'
  }
  measure {
    name 'BalanceDue'
    title 'Balance Due'
    description 'What is still due, added up'
    sql '${CUBE}.balance_due'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'OldestDueDate'
    title 'Oldest Due Date'
    description 'The earliest due date still unpaid'
    sql '${CUBE}.due_date'
    type 'min'
  }
  measure {
    name 'LargestBalance'
    title 'Largest Balance'
    description 'The largest amount still due on one invoice'
    sql '${CUBE}.balance_due'
    type 'max'
    format 'currency'
  }
}

cube('invoices') {
  sql_table 'cube_demo.erp_invoices'
  sql_alias 'inv'
  title 'All Invoices'
  description 'Every invoice, paid or not, read under the short name inv'

  dimension {
    name 'InvoiceId'
    title 'Invoice Id'
    description 'The invoice number'
    sql '${CUBE}.invoice_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Paid, Open or Overdue'
    sql '${CUBE}.status'
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

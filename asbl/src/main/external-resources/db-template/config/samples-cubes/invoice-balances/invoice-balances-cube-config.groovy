// ═══════════════════════════════════════════════════════════════════════════
// Invoice Balances — the credit controller's own query, as a cube
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per invoice, with the balance still due on it — what
// was invoiced less what has been paid against it. The unpaid segment is the
// credit controller's question: which invoices still owe us something.
//
// Why this one is built on SQL where the others name a table: it is not a table,
// it is a query. The balance needs the payments added up per invoice first, and
// the DSL has no place to say that — so the cube is built on the SQL that says
// it, and everything else (dimensions, measures, the segment) works exactly as
// it does on a table cube. That is what this sample is for. The invoice domain
// itself is in customer-invoices and customer-payments; this one overlaps them
// on purpose, to show SQL inside the cube DSL.
//
// sql_alias 'inv' is the short name the derived table is given, so every
// ${CUBE} in this file reads inv. Without it the generator picks its own.
//
// Grain: one row per invoice, as the query returns it. Nothing is joined on top,
// so no measure can be multiplied.
//
// What it can answer:
//   - what is still due, over everything or per customer (BalanceDue,
//     LargestBalance, Invoices), worst debtor first;
//   - how old the debt is (OldestDueDate, DueDate);
//   - which invoice it is (InvoiceId, InvoiceNo, Customer, Status);
//   - and with the unpaid segment, all of that for the 432 invoices that are not
//     Paid (373 Overdue, 59 Open).
//
// Data: cube_demo.erp_invoices (2,000), cube_demo.erp_customers (80) and
// cube_demo.erp_payments (1,700), added up per invoice inside the query.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql '''SELECT i.invoice_id, i.invoice_no, c.name AS customer, i.status, i.due_date,
         i.total_amount - COALESCE(p.paid, 0) AS balance_due
  FROM cube_demo.erp_invoices i
  JOIN cube_demo.erp_customers c ON c.customer_id = i.customer_id
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid
             FROM cube_demo.erp_payments GROUP BY invoice_id) p
    ON p.invoice_id = i.invoice_id'''
  sql_alias 'inv'
  title 'Invoice Balances'
  description 'Every invoice with the balance still due on it, unpaid ones on their own'

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
    description 'The customer the invoice was sent to'
    sql '${CUBE}.customer'
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
    name 'DueDate'
    title 'Due'
    description 'The day the invoice was due'
    sql '${CUBE}.due_date'
    type 'time'
  }

  measure {
    name 'Invoices'
    title 'Invoices'
    description 'How many invoices there are'
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
    description 'The earliest due date in the answer'
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

  segment {
    name 'unpaid'
    title 'Not paid yet'
    description 'The invoices with something still due on them'
    sql "\${CUBE}.status <> 'Paid'"
  }
}

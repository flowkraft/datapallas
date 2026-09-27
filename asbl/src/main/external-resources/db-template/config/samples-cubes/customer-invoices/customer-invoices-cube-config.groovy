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
// customer-payments.
//
// Data: cube_demo.erp_invoices (2,000 invoices — 1,568 Paid, 373 Overdue,
// 59 Open), cube_demo.erp_invoice_lines (5,500) and cube_demo.erp_customers (80).
// ═══════════════════════════════════════════════════════════════════════════

cube {
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

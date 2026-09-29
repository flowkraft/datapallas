// ═══════════════════════════════════════════════════════════════════════════
// Demo Finance — the invoices, and what is still to be collected
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per invoice, with the customer it was sent to.
//
// Grain: one invoice. Billed is the whole invoice, amount plus tax, the same
// sum the demo data's truths use; Open Amount and Overdue Amount are that same
// sum over the invoices still to be collected, so the three stand next to each
// other and add up the way the receivables report does. Payments are not in
// this cube: a part-paid invoice has several of them, and they would multiply
// every number here.
//
// Joins, both many_to_one, so no measure is multiplied:
//   dash_demo.customers on customer_id, and, hanging off the customer,
//   dash_demo.geo_cities on city_id for the country.
//
// Open and overdue follow the truths' own definitions: open is status in
// ('open', 'overdue', 'partially_paid') - an overdue invoice is still open -
// and overdue is status = 'overdue' on its own.
//
// What it can answer: what was billed by issue month, quarter or year, by
// Status, by customer Segment and by Country; how much of it is still open and
// how much of that is late; and which segment or country is carrying the
// receivables.
//
// Data: dash_demo.invoices (8,933 invoices for 902 customers, issued between
// 2024-01-01 and 2026-09-30), 29,172,759.59 billed, of which 1,637,606.29 is
// still open and 201,658.32 is overdue.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'dash_demo.invoices'
  title 'Demo Finance'
  description 'What was billed, what is still open and what is overdue, by month, status, segment and country'
  currency 'EUR'

  join {
    name 'dash_demo.customers'
    title 'Customers'
    description 'The customer the invoice was sent to'
    sql '${CUBE}.customer_id = dash_demo.customers.customer_id'
    relationship 'many_to_one'
  }
  join {
    name 'dash_demo.geo_cities'
    title 'Cities'
    description 'The city the customer is in, and the country it is in'
    parent 'dash_demo.customers'
    sql 'dash_demo.customers.city_id = dash_demo.geo_cities.city_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'InvoiceId'
    title 'Invoice'
    description 'The invoice number'
    sql '${CUBE}.invoice_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'InvoiceNo'
    title 'Invoice No'
    description 'The invoice number as it is printed on the invoice'
    sql '${CUBE}.invoice_no'
    type 'string'
  }
  dimension {
    name 'IssuedAt'
    title 'Issued'
    description 'The day the invoice was issued. Group it by month, quarter or year'
    sql '${CUBE}.issue_date'
    type 'time'
  }
  dimension {
    name 'DueAt'
    title 'Due'
    description 'The day the invoice is due'
    sql '${CUBE}.due_date'
    type 'time'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'paid, open, partially_paid or overdue'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'Source'
    title 'Source'
    description 'What the invoice is for: an order, or a care_plan subscription'
    sql '${CUBE}.source'
    type 'string'
  }
  dimension {
    name 'Customer'
    title 'Customer'
    description 'The customer the invoice was sent to'
    sql 'dash_demo.customers.name'
    type 'string'
  }
  dimension {
    name 'Segment'
    title 'Segment'
    description 'The segment the customer is in: Consumer, SMB or Enterprise'
    sql 'dash_demo.customers.segment'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the customer is in'
    sql 'dash_demo.geo_cities.country'
    type 'string'
  }

  measure {
    name 'Billed'
    title 'Billed'
    description 'What was invoiced, amount and tax together'
    sql '${CUBE}.amount + ${CUBE}.tax_amount'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'OpenAmount'
    title 'Open Amount'
    description 'What is still to be collected: the invoices that are open, part paid or overdue. PICK THIS WHEN: the question is the receivables, not the sales'
    sql '${CUBE}.amount + ${CUBE}.tax_amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.status IN ('open', 'overdue', 'partially_paid')"
    }
  }
  measure {
    name 'OverdueAmount'
    title 'Overdue Amount'
    description 'The part of the open amount that is already late. PICK THIS WHEN: the question is which invoices need chasing'
    sql '${CUBE}.amount + ${CUBE}.tax_amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.status = 'overdue'"
    }
  }
  measure {
    name 'Invoices'
    title 'Invoices'
    description 'How many invoices there are'
    type 'count'
  }

  segment {
    name 'open'
    title 'Still open'
    description 'Invoices that are open, part paid or overdue'
    sql "\${CUBE}.status IN ('open', 'overdue', 'partially_paid')"
  }
  segment {
    name 'overdue'
    title 'Overdue'
    description 'Invoices that are already past their due date and unpaid'
    sql "\${CUBE}.status = 'overdue'"
  }
}

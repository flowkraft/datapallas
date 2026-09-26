// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 3 — Deals per Month
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "are we creating more deals than last year, month by month and
// quarter by quarter?"
// Who asks it: the head of sales.
//
// What the cube does here: time periods. A dimension of type 'time' can be read
// by day, week, month, quarter or year without touching the cube — the period
// is picked next to the field, and each database gets its own truncation.
//
// Note the three dates: every deal has a created_date and an expected_close_date,
// but only the 646 closed ones have a close_date, so a Close Date drill answers
// on those alone.
//
// Data: cube_demo.crm_deals (1,200 deals, 2025-01-01 … 2026-09-30).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.crm_deals'
  title 'Deals per Month'
  description 'How many deals are created in each period'

  dimension {
    name 'CreatedDate'
    title 'Created Date'
    description 'The day the deal was created'
    sql '${CUBE}.created_date'
    type 'time'
  }
  dimension {
    name 'ExpectedCloseDate'
    title 'Expected Close Date'
    description 'The day the deal is expected to close — set on every deal, open ones included'
    sql '${CUBE}.expected_close_date'
    type 'time'
  }
  dimension {
    name 'CloseDate'
    title 'Close Date'
    description 'The day the deal was won or lost. Empty while the deal is still open'
    sql '${CUBE}.close_date'
    type 'time'
  }
  dimension {
    name 'Stage'
    title 'Stage'
    description 'How far the deal has got'
    sql '${CUBE}.stage'
    type 'string'
  }

  measure {
    name 'Deals'
    title 'Deals'
    description 'How many deals there are'
    type 'count'
  }
  measure {
    name 'DealValue'
    title 'Deal Value'
    description 'What those deals are worth, added up'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
  }
}

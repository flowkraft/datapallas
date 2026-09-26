// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 5 — Win Rate
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "of the deals we close, how many do we win, and which lead
// sources win most?"
// Who asks it: the sales director. It is the number the board asks for.
//
// What the cube does here: two things at once.
//   - measures that count only some of the rows (a measure's own 'filters'),
//     so Won Deals and Closed Deals live in the same cube as Deals;
//   - a measure calculated from other measures: Win Rate is
//     100 × Won Deals ÷ Closed Deals, written with ${WonDeals} and
//     ${ClosedDeals} rather than repeating their SQL.
//
// Data: cube_demo.crm_deals (1,200 deals: 402 won, 244 lost, 554 still open).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.crm_deals'
  title 'Win Rate'
  description 'Won, lost and closed deals, and the rate between them'

  dimension {
    name 'LeadSource'
    title 'Lead Source'
    description 'Where the deal came from: Website, Referral, Outbound, Partner or Trade Show'
    sql '${CUBE}.lead_source'
    type 'string'
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
    name 'WonDeals'
    title 'Won Deals'
    description 'Deals we won'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Won'"
    }
  }
  measure {
    name 'LostDeals'
    title 'Lost Deals'
    description 'Deals we lost'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Lost'"
    }
  }
  measure {
    name 'ClosedDeals'
    title 'Closed Deals'
    description 'Deals that are decided, won or lost'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage IN ('Closed Won', 'Closed Lost')"
    }
  }
  measure {
    name 'WonValue'
    title 'Won Value'
    description 'What the won deals are worth'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Won'"
    }
  }
  measure {
    name 'OpenPipeline'
    title 'Open Pipeline'
    description 'What the deals that are still open are worth'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.stage NOT IN ('Closed Won', 'Closed Lost')"
    }
  }
  measure {
    name 'WinRate'
    title 'Win Rate'
    description 'Won deals as a percentage of the deals that are decided'
    sql '100.0 * ${WonDeals} / NULLIF(${ClosedDeals}, 0)'
    type 'number'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 2 — Pipeline by Stage
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "where do our deals stand, stage by stage?"
// Who asks it: the sales manager.
//
// What the cube does here: grouping by a field. Tick Stage and the answer has
// one row per stage — with or without a measure next to it.
//
// Data: cube_demo.crm_deals (1,200 deals, 6 stages).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.crm_deals'
  title 'Pipeline by Stage'
  description 'Deals and deal value, stage by stage'

  dimension {
    name 'Stage'
    title 'Stage'
    description 'How far the deal has got: Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost'
    sql '${CUBE}.stage'
    type 'string'
  }
  dimension {
    name 'DealType'
    title 'Deal Type'
    description 'New business or a renewal'
    sql '${CUBE}.deal_type'
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

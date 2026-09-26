// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 1 — Sales Pipeline
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "how many deals do we have, and what are they worth?"
// Who asks it: the sales manager, every Monday.
//
// What the cube does here: the smallest cube there is — one table and two
// numbers. Nothing to group by, nothing to join: tick a measure and read the
// answer.
//
// Data: cube_demo.crm_deals (1,200 deals), in the cube_demo schema of the
// bundled DuckDB sample database.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.crm_deals'
  title 'Sales Pipeline'
  description 'How many deals are in the pipeline, and what they are worth'

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

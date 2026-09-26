// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 8 — Shipments by Destination
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "where do our shipments go, by country and then by city?"
// Who asks it: the logistics planner.
//
// What the cube does here: a drill path. Country and City are two fields, and
// the hierarchy says which one comes first, so ticking City ticks Country with
// it and unticking Country takes City away again.
//
// Data: cube_demo.logistics_shipments (4,000 shipments, 14 countries, 44
// country-and-city pairs).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_shipments'
  title 'Shipments by Destination'
  description 'Where the shipments go: country, then city'

  dimension {
    name 'DestCountry'
    title 'Country'
    description 'The country the shipment goes to'
    sql '${CUBE}.dest_country'
    type 'string'
  }
  dimension {
    name 'DestCity'
    title 'City'
    description 'The city the shipment goes to'
    sql '${CUBE}.dest_city'
    type 'string'
  }

  measure {
    name 'Shipments'
    title 'Shipments'
    description 'How many shipments there are'
    type 'count'
  }
  measure {
    name 'WeightKg'
    title 'Weight (kg)'
    description 'How much the shipments weigh, added up'
    sql '${CUBE}.weight_kg'
    type 'sum'
  }

  hierarchy {
    name 'destination'
    title 'Destination'
    description 'Country first, then the city inside it'
    levels 'DestCountry', 'DestCity'
  }
}

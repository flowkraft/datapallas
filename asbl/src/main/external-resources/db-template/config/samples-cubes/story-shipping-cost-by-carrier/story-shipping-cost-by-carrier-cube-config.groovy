// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 11 — Shipping Cost by Carrier
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "what do we spend with each carrier, on how much weight, and by
// transport mode?"
// Who asks it: the logistics buyer, before a carrier negotiation.
//
// What the cube does here: a lookup table joined in, keeping the rows that have
// no match. 40 shipments are not assigned to a carrier yet and 8 name a carrier
// that no longer exists: the join keeps all 48 of them, in one empty group. An
// inner join would answer 3,952 shipments and would lose a whole transport mode
// with them, because both Air carriers have no shipment at all.
//
// Data: cube_demo.logistics_shipments (4,000) and cube_demo.logistics_carriers
// (12 carriers, 10 of which ship).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_shipments'
  title 'Shipping Cost by Carrier'
  description 'What each carrier carries, and what it costs'

  join {
    name 'cube_demo.logistics_carriers'
    title 'Carriers'
    description 'The carrier the shipment was given to'
    sql '${CUBE}.carrier_id = cube_demo.logistics_carriers.carrier_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'ShipmentId'
    title 'Shipment'
    description 'The shipment number'
    sql '${CUBE}.shipment_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Carrier'
    title 'Carrier'
    description 'The carrier name. Empty when the shipment has no carrier yet'
    sql 'cube_demo.logistics_carriers.name'
    type 'string'
  }
  dimension {
    name 'Mode'
    title 'Transport Mode'
    description 'Road, Rail, Sea or Air'
    sql 'cube_demo.logistics_carriers.transport_mode'
    type 'string'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Awaiting Pickup, In Transit, Delayed, Delivered or Returned'
    sql '${CUBE}.status'
    type 'string'
  }

  measure {
    name 'Shipments'
    title 'Shipments'
    description 'How many shipments there are'
    type 'count'
  }
  measure {
    name 'ShippingCost'
    title 'Shipping Cost'
    description 'What the shipments cost, added up'
    sql '${CUBE}.shipping_cost'
    type 'sum'
    format 'currency'
  }
  measure {
    name 'WeightKg'
    title 'Weight (kg)'
    description 'How much the shipments weigh, added up'
    sql '${CUBE}.weight_kg'
    type 'sum'
  }
}

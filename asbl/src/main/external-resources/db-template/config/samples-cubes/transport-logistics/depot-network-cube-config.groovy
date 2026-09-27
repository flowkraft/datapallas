// ═══════════════════════════════════════════════════════════════════════════
// Depot Network — where our depots are, how big, and how busy
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per depot, with where it is, how many pallets it holds
// and how many loading docks it has, and the shipments that left from it.
//
// Joins: cube_demo.logistics_shipments on origin_depot_id, one_to_many. It is a
// LEFT join, so a depot that shipped nothing is still in the answer, with 0.
//
// Grain: one row per depot. PalletCapacity and Docks are the depot's own, and
// they count once per depot however many shipments are joined to it: the
// generator adds them up per depot before the shipments can repeat them.
// Shipments counts the shipments that left from each depot.
//
// What it can answer:
//   - where the depots are and how big they are, on a map (Location);
//   - which depots carry the load against their size (Shipments next to
//     PalletCapacity), which Freight Shipments cannot answer: read from the
//     shipments, a depot's capacity is added once per shipment, and a depot
//     with no shipment is not there at all;
//   - which depots shipped nothing, with the idle segment.
//
// Data: cube_demo.logistics_depots (30 depots, 22,170 pallets, 331 docks) and
// cube_demo.logistics_shipments (4,000). Two depots, Lisbon and Krakow, have
// shipped nothing.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_depots'
  title 'Depot Network'
  description 'Where our depots are, how big they are, and how many shipments leave from each'

  join {
    name 'cube_demo.logistics_shipments'
    title 'Shipments'
    description 'The shipments that left from the depot'
    sql '${CUBE}.depot_id = cube_demo.logistics_shipments.origin_depot_id'
    relationship 'one_to_many'
  }

  dimension {
    name 'DepotId'
    title 'Depot Id'
    description 'The depot number'
    sql '${CUBE}.depot_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Depot'
    title 'Depot'
    description 'The depot name'
    sql '${CUBE}.name'
    type 'string'
  }
  dimension {
    name 'City'
    title 'City'
    description 'The city the depot is in'
    sql '${CUBE}.city'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the depot is in'
    sql '${CUBE}.country'
    type 'string'
  }
  dimension {
    name 'Location'
    title 'Location'
    description 'Where the depot is, as a point on a map'
    type 'geo'
    latitude '${CUBE}.latitude'
    longitude '${CUBE}.longitude'
  }

  measure {
    name 'Depots'
    title 'Depots'
    description 'How many depots there are'
    type 'count'
  }
  measure {
    name 'PalletCapacity'
    title 'Pallet Capacity'
    description 'How many pallets the depots hold, added up'
    sql '${CUBE}.capacity_pallets'
    type 'sum'
  }
  measure {
    name 'Docks'
    title 'Docks'
    description 'How many loading docks the depots have, added up'
    sql '${CUBE}.docks'
    type 'sum'
  }
  measure {
    name 'Shipments'
    title 'Shipments'
    description 'How many shipments left from the depot. A depot that shipped nothing answers 0'
    sql 'cube_demo.logistics_shipments.shipment_id'
    type 'count'
  }

  segment {
    name 'idle'
    title 'Idle'
    description 'The depots no shipment has left from'
    sql '${CUBE}.depot_id NOT IN (SELECT s.origin_depot_id FROM cube_demo.logistics_shipments s WHERE s.origin_depot_id IS NOT NULL)'
  }
}

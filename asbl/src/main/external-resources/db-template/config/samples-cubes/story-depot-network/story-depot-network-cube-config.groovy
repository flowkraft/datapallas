// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 9 — Depot Network
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "where are our depots, and how much capacity does each one
// have?"
// Who asks it: the network planner.
//
// What the cube does here: a map. Location is one field made of two columns —
// a latitude and a longitude — and it comes back as Location_lat and
// Location_lng, which is what a map widget reads. Two of the thirty depots
// share a latitude, so a map that grouped on one column alone would lose a pin.
//
// Data: cube_demo.logistics_depots (30 depots, 22,170 pallets, 331 docks;
// Madrid and Lisbon have negative longitudes).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_depots'
  title 'Depot Network'
  description 'Where the depots are and how big they are'

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
}

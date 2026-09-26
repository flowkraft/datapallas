// ═══════════════════════════════════════════════════════════════════════════
// Shipments — the logistics desk
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: two cubes. Shipments is every shipment with the carrier that
// took it and the depot it left from; Depots is the depot network itself, one
// row per depot, with its place on the map.
//
// Grain: one row per shipment in the first cube, one row per depot in the
// second. The picker lists both; switching from one to the other clears the
// ticks and the SQL, and each reads its own table.
//
// Joins (Shipments): cube_demo.logistics_carriers on carrier_id and
// cube_demo.logistics_depots on origin_depot_id, both many_to_one. The
// generator writes them as LEFT joins, and that is the point: 40 shipments have
// no carrier yet and 8 name a carrier that no longer exists, so all 48 stay in
// the answer, in one empty group. An inner join would answer 3,952.
//
// What Shipments can answer:
//   - what we ship and what it costs, by month and status, latest month first
//     (BookedDate is declared desc and Status asc, so nobody has to ask);
//   - where it goes (the destination drill, country then city) and where it
//     comes from (the origin drill, country then depot);
//   - what we spend with each carrier, on how much weight, by transport mode;
//   - how fast and how dear each mode is: Air costs 0.187 per kg at 2.2 days
//     against Road's 0.057 at 4.9 — CostPerKg over Mode is the whole answer;
//   - how long things take (AvgTransitDays), how much room they need (Pallets),
//     and the named filters delivered, in_transit and air.
//
// What Depots can answer: where the depots are, as points on a map (Location is
// one field made of a latitude and a longitude, and comes back as Location_lat
// and Location_lng, which is what a map widget reads), and how big they are.
//
// Data: cube_demo.logistics_shipments (4,000), cube_demo.logistics_carriers
// (12 carriers, all 12 shipping since the Air volume arrived) and
// cube_demo.logistics_depots (30 depots, 22,170 pallets, 331 docks; Madrid and
// Lisbon have negative longitudes, and two depots share a latitude).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_shipments'
  title 'Shipments'
  description 'What we ship, where to, with whom, and what it costs'

  join {
    name 'cube_demo.logistics_carriers'
    title 'Carriers'
    description 'The carrier the shipment was given to'
    sql '${CUBE}.carrier_id = cube_demo.logistics_carriers.carrier_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.logistics_depots'
    title 'Origin Depots'
    description 'The depot the shipment left from'
    sql '${CUBE}.origin_depot_id = cube_demo.logistics_depots.depot_id'
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
    name 'TrackingNo'
    title 'Tracking No'
    description 'The tracking number as the customer sees it'
    sql '${CUBE}.tracking_no'
    type 'string'
  }
  dimension {
    name 'BookedDate'
    title 'Booked'
    description 'The day the shipment was booked'
    sql '${CUBE}.booked_date'
    type 'time'
    order 'desc'
  }
  dimension {
    name 'DeliveredDate'
    title 'Delivered'
    description 'The day the shipment arrived. Empty while it is still on its way'
    sql '${CUBE}.delivered_date'
    type 'time'
    order 'asc'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Awaiting Pickup, In Transit, Delayed, Delivered or Returned'
    sql '${CUBE}.status'
    type 'string'
    order 'asc'
  }
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
  dimension {
    name 'ServiceLevel'
    title 'Service Level'
    description 'Economy, Standard or Express'
    sql '${CUBE}.service_level'
    type 'string'
  }
  dimension {
    name 'TransitDays'
    title 'Transit Days'
    description 'How many days the shipment is planned to take'
    sql '${CUBE}.transit_days'
    type 'number'
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
    name 'CarrierCountry'
    title 'Carrier Country'
    description 'The country the carrier is based in'
    sql 'cube_demo.logistics_carriers.country'
    type 'string'
  }
  dimension {
    name 'OriginDepot'
    title 'Origin Depot'
    description 'The depot the shipment left from'
    sql 'cube_demo.logistics_depots.name'
    type 'string'
  }
  dimension {
    name 'OriginCountry'
    title 'Origin Country'
    description 'The country the shipment left from'
    sql 'cube_demo.logistics_depots.country'
    type 'string'
  }
  dimension {
    name 'OriginCity'
    title 'Origin City'
    description 'The city the shipment left from'
    sql 'cube_demo.logistics_depots.city'
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
  measure {
    name 'Pallets'
    title 'Pallets'
    description 'How many pallets the shipments take, added up'
    sql '${CUBE}.pallets'
    type 'sum'
  }
  measure {
    name 'AvgTransitDays'
    title 'Average Transit Days'
    description 'How many days a shipment takes, on average'
    sql '${CUBE}.transit_days'
    type 'avg'
  }
  measure {
    name 'CostPerKg'
    title 'Cost per kg'
    description 'What a kilogram costs to move: the cost divided by the weight'
    sql '${ShippingCost} / NULLIF(${WeightKg}, 0)'
    type 'number'
    format 'currency'
  }

  segment {
    name 'delivered'
    title 'Delivered'
    description 'Shipments that have arrived'
    sql "\${CUBE}.status = 'Delivered'"
  }
  segment {
    name 'in_transit'
    title 'In transit'
    description 'Shipments that are on their way'
    sql "\${CUBE}.status = 'In Transit'"
  }
  segment {
    name 'air'
    title 'By air'
    description 'Shipments given to an air carrier'
    sql "cube_demo.logistics_carriers.transport_mode = 'Air'"
  }

  hierarchy {
    name 'destination'
    title 'Destination'
    description 'Country first, then the city inside it'
    levels 'DestCountry', 'DestCity'
  }
  hierarchy {
    name 'origin'
    title 'Origin'
    description 'The origin country first, then the depot inside it'
    levels 'OriginCountry', 'OriginDepot'
  }
}

cube('depots') {
  sql_table 'cube_demo.logistics_depots'
  title 'Depots'
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
}

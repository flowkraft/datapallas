// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 7 — Shipments per Month
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "what did we ship each month, and what is still waiting, in
// transit or delayed?"
// Who asks it: the operations manager.
//
// What the cube does here: a sort order set in the cube itself. Booked Date is
// declared 'desc' and Status 'asc', so the answer comes back latest month
// first, statuses A to Z inside each month, without anybody asking for it.
//
// Only the last two months hold anything but Delivered and Returned: older
// shipments have all arrived.
//
// Data: cube_demo.logistics_shipments (4,000 shipments, 2025-01 … 2026-09).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.logistics_shipments'
  title 'Shipments per Month'
  description 'Shipments by month and status, latest month first'

  dimension {
    name 'ShipmentId'
    title 'Shipment'
    description 'The shipment number'
    sql '${CUBE}.shipment_id'
    type 'number'
    primary_key true
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
    name 'Status'
    title 'Status'
    description 'Awaiting Pickup, In Transit, Delayed, Delivered or Returned'
    sql '${CUBE}.status'
    type 'string'
    order 'asc'
  }
  dimension {
    name 'DeliveredDate'
    title 'Delivered'
    description 'The day the shipment arrived. Empty while it is still on its way'
    sql '${CUBE}.delivered_date'
    type 'time'
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
}

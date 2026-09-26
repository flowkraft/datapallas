// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 4 — Ticket Resolution
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "how many tickets are still open, and which of them are urgent
// or already past their SLA?"
// Who asks it: the support lead, at the daily stand-up.
//
// What the cube does here: named filters. A segment is a condition the author
// writes once and everybody ticks by name. Two ticked together are ANDed, each
// inside its own parentheses — without them, 'urgent OR breached' would spill
// out of the AND and answer 790 instead of 347.
//
// Data: cube_demo.support_tickets (3,000 tickets; 41 of them have no agent and
// no first response yet).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.support_tickets'
  title 'Ticket Resolution'
  description 'Open, urgent and SLA-breached tickets'

  dimension {
    name 'TicketId'
    title 'Ticket'
    description 'The ticket number'
    sql '${CUBE}.ticket_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'Open, In Progress, Waiting on Customer, Resolved or Closed'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'Priority'
    title 'Priority'
    description 'Low, Normal, High or Urgent'
    sql '${CUBE}.priority'
    type 'string'
  }
  dimension {
    name 'Channel'
    title 'Channel'
    description 'How the ticket reached us'
    sql '${CUBE}.channel'
    type 'string'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'What the ticket is about'
    sql '${CUBE}.category'
    type 'string'
  }
  dimension {
    name 'OpenedDate'
    title 'Opened'
    description 'The day the ticket was opened'
    sql '${CUBE}.opened_date'
    type 'time'
  }

  measure {
    name 'Tickets'
    title 'Tickets'
    description 'How many tickets there are'
    type 'count'
  }
  measure {
    name 'AvgResolutionHours'
    title 'Average Resolution Hours'
    description 'How long a resolved ticket took, on average. Tickets still open do not count'
    sql '${CUBE}.resolution_hours'
    type 'avg'
  }

  segment {
    name 'open'
    title 'Still open'
    description 'Tickets nobody has resolved or closed yet'
    sql "\${CUBE}.status IN ('Open', 'In Progress', 'Waiting on Customer')"
  }
  segment {
    name 'urgent_or_breached'
    title 'Urgent or past SLA'
    description 'Tickets marked Urgent, and tickets whose SLA is already breached'
    sql "\${CUBE}.priority = 'Urgent' OR \${CUBE}.sla_breached = 1"
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo Support — the tickets the desk has taken
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per ticket, with the agent who owns it.
//
// Grain: one ticket. Tickets counts tickets and Open Tickets counts the ones
// nobody has finished; the two averages are per ticket, and a ticket with no
// answer yet, or with nobody scoring it, does not count in its own average.
//
// Joins: dash_demo.support_agents on agent_id, many_to_one, so no measure is
// multiplied. The generator writes it as a LEFT join.
//
// Average First Response Minutes is computed from the two timestamps rather
// than stored, so it stays true if either one moves: the minutes between
// opened_ts and first_response_ts. The 8 tickets with no first answer yet are
// simply not in the average.
//
// What it can answer: how many tickets there are by opened month, quarter or
// year, by Channel, Category, Priority, Status and Team; how many are still
// open; how quickly the desk answers first; and how happy the customer was.
//
// Data: dash_demo.support_tickets (14,000 tickets opened between 2024-01-01 and
// 2026-09-30, of which 127 are still open) and dash_demo.support_agents (32
// agents in 4 teams). The first answer takes 836.55 minutes on average, and the
// 5,834 scored tickets average 4.01 out of 5.
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'dash_demo.support_tickets'
  title 'Demo Support'
  description 'Tickets, how many are open, how fast the first answer is and how happy the customer was'
  currency 'EUR'

  join {
    name 'dash_demo.support_agents'
    title 'Agents'
    description 'The agent who owns the ticket'
    sql '${CUBE}.agent_id = dash_demo.support_agents.agent_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'TicketId'
    title 'Ticket'
    description 'The ticket number'
    sql '${CUBE}.ticket_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'OpenedAt'
    title 'Opened'
    description 'When the ticket was opened. Group it by month, quarter or year'
    sql '${CUBE}.opened_ts'
    type 'time'
  }
  dimension {
    name 'ResolvedAt'
    title 'Resolved'
    description 'When the ticket was resolved. Empty while it is still open'
    sql '${CUBE}.resolved_ts'
    type 'time'
  }
  dimension {
    name 'Status'
    title 'Status'
    description 'open, pending, resolved or closed'
    sql '${CUBE}.status'
    type 'string'
  }
  dimension {
    name 'Priority'
    title 'Priority'
    description 'low, normal, high or urgent'
    sql '${CUBE}.priority'
    type 'string'
  }
  dimension {
    name 'Channel'
    title 'Channel'
    description 'How the ticket reached the desk: email, chat, phone or web_form'
    sql '${CUBE}.channel'
    type 'string'
  }
  dimension {
    name 'Category'
    title 'Category'
    description 'What the ticket is about: billing, delivery, returns, product_defect, how_to or account'
    sql '${CUBE}.category'
    type 'string'
  }
  dimension {
    name 'Agent'
    title 'Agent'
    description 'The agent who owns the ticket'
    sql 'dash_demo.support_agents.name'
    type 'string'
  }
  dimension {
    name 'Team'
    title 'Team'
    description 'The team the agent is in: Tier 1, Technical, Billing or Returns'
    sql 'dash_demo.support_agents.team'
    type 'string'
  }

  measure {
    name 'Tickets'
    title 'Tickets'
    description 'How many tickets there are'
    type 'count'
  }
  measure {
    name 'OpenTickets'
    title 'Open Tickets'
    description 'Tickets nobody has resolved or closed yet. PICK THIS WHEN: the question is the queue as it stands, not the work that was done'
    type 'count'
    filters {
      filter sql: "\${CUBE}.status IN ('open', 'pending')"
    }
  }
  measure {
    name 'AvgFirstResponseMinutes'
    title 'Average First Response Minutes'
    description 'How long the first answer took, in minutes, on average. Tickets with no answer yet do not count'
    sql 'date_diff(\'minute\', ${CUBE}.opened_ts, ${CUBE}.first_response_ts)'
    type 'avg'
    format 'number'
  }
  measure {
    name 'AvgCsat'
    title 'Average CSAT'
    description 'How the customer scored the ticket, from 1 to 5, on average. Tickets nobody scored do not count'
    sql '${CUBE}.csat_score'
    type 'avg'
    format 'number'
  }

  segment {
    name 'open'
    title 'Still open'
    description 'Tickets nobody has resolved or closed yet'
    sql "\${CUBE}.status IN ('open', 'pending')"
  }
  segment {
    name 'urgent'
    title 'Urgent'
    description 'Tickets marked urgent'
    sql "\${CUBE}.priority = 'urgent'"
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Support Desk — the tickets the support desk has taken
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per ticket, with the agent who owns it and the
// account it came from.
//
// Grain: one row per ticket. Tickets counts tickets; the two averages are per
// ticket, and a ticket still open has no resolution time to average.
//
// Joins: cube_demo.support_agents on agent_id and cube_demo.crm_accounts on
// account_id, both many_to_one. The generator writes them as LEFT joins, which
// is what keeps the 41 tickets nobody has picked up yet in the answer.
//
// What it can answer:
//   - how many tickets there are, by Status, Priority, Channel, Category and by
//     the day they were opened or resolved;
//   - how long they take (AvgResolutionHours, AvgFirstResponseMinutes);
//   - how often we miss the SLA, as a count and as a rate (BreachedTickets,
//     BreachRate), and the named filters everyone ticks by name (open,
//     urgent_or_breached, breached);
//   - and, now that the agent and the account are in the same cube, the
//     question the desk actually has: who and what is breaching. The breach
//     rate is 42% in Tier 2 against 25-27% elsewhere, 76% on Outage against
//     26-36% elsewhere, and 44% on Urgent; the 22 tickets that are all three at
//     once breach 17 times.
//
// Data: cube_demo.support_tickets (3,000 tickets), cube_demo.support_agents
// (15) and cube_demo.crm_accounts (60).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.support_tickets'
  title 'Support Desk'
  description 'Tickets, how long they take, and how often the SLA is missed'

  join {
    name 'cube_demo.support_agents'
    title 'Agents'
    description 'The agent who owns the ticket. Empty while nobody has picked it up'
    sql '${CUBE}.agent_id = cube_demo.support_agents.agent_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.crm_accounts'
    title 'Accounts'
    description 'The account the ticket came from'
    sql '${CUBE}.account_id = cube_demo.crm_accounts.account_id'
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
    name 'Subject'
    title 'Subject'
    description 'What the ticket says it is about'
    sql '${CUBE}.subject'
    type 'string'
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
  dimension {
    name 'ResolvedDate'
    title 'Resolved'
    description 'The day the ticket was resolved. Empty while it is still open'
    sql '${CUBE}.resolved_date'
    type 'time'
  }
  dimension {
    name 'SlaBreached'
    title 'SLA Breached'
    description '1 when the ticket is already past its SLA, 0 when it is not'
    sql '${CUBE}.sla_breached'
    type 'number'
  }
  dimension {
    name 'Agent'
    title 'Agent'
    description 'The agent who owns the ticket. Empty while nobody has picked it up'
    sql 'cube_demo.support_agents.name'
    type 'string'
  }
  dimension {
    name 'Team'
    title 'Team'
    description 'The team the agent is in: Tier 1, Tier 2, Billing or Onboarding'
    sql 'cube_demo.support_agents.team'
    type 'string'
  }
  dimension {
    name 'Account'
    title 'Account'
    description 'The account the ticket came from'
    sql 'cube_demo.crm_accounts.name'
    type 'string'
  }
  dimension {
    name 'Industry'
    title 'Industry'
    description 'The industry the account is in'
    sql 'cube_demo.crm_accounts.industry'
    type 'string'
  }
  dimension {
    name 'AccountTier'
    title 'Account Tier'
    description 'How big the account is: Small, Mid-Market, Enterprise or Strategic'
    sql 'cube_demo.crm_accounts.account_tier'
    type 'string'
  }
  dimension {
    name 'AccountCountry'
    title 'Account Country'
    description 'The country the account is in'
    sql 'cube_demo.crm_accounts.country'
    type 'string'
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
  measure {
    name 'AvgFirstResponseMinutes'
    title 'Average First Response Minutes'
    description 'How long the first answer took, on average. Tickets with no answer yet do not count'
    sql '${CUBE}.first_response_minutes'
    type 'avg'
  }
  measure {
    name 'BreachedTickets'
    title 'Breached Tickets'
    description 'Tickets that are already past their SLA'
    type 'count'
    filters {
      filter sql: "\${CUBE}.sla_breached = 1"
    }
  }
  measure {
    name 'BreachRate'
    title 'Breach Rate'
    description 'Breached tickets as a percentage of all the tickets in the answer'
    sql '100.0 * ${BreachedTickets} / NULLIF(${Tickets}, 0)'
    type 'number'
  }
  measure {
    name 'Accounts'
    title 'Accounts'
    description 'How many different accounts have a ticket'
    sql '${CUBE}.account_id'
    type 'count_distinct'
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
  segment {
    name 'breached'
    title 'Past SLA'
    description 'Tickets whose SLA is already breached'
    sql "\${CUBE}.sla_breached = 1"
  }
}

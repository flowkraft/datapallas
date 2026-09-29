// ═══════════════════════════════════════════════════════════════════════════
// Sales Pipeline — the deals the sales team is working on
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per deal, with the account it is for and the rep who
// owns it. Deals counts deals, DealValue adds up their amount.
//
// Joins: cube_demo.crm_accounts on account_id and cube_demo.crm_sales_reps on
// rep_id, both many_to_one. The generator writes them as LEFT joins, so a deal
// whose account or rep is missing still counts.
//
// What it can answer:
//   - how many deals there are and what they are worth (Deals, DealValue);
//   - where they stand (Stage, DealType), where they came from (LeadSource);
//   - how they arrive and close over time (CreatedDate, ExpectedCloseDate and
//     CloseDate, each readable by day, week, month, quarter or year — only the
//     646 closed deals have a CloseDate);
//   - what we win and what is still open, in the same answer as the total
//     (WonDeals, LostDeals, ClosedDeals, WonValue, OpenPipeline), and the rate
//     between them (WinRate, worked out from two other measures);
//   - whose deals they are and where (Rep, Region, Quota, Account, Industry,
//     AccountTier, the account_place drill from country down to city);
//   - deal size by account tier — Strategic accounts buy at roughly nine times
//     the size a Small account does.
//
// Data: cube_demo.crm_deals (1,200 deals), cube_demo.crm_accounts (60) and
// cube_demo.crm_sales_reps (12).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.crm_deals'
  title 'Sales Pipeline'
  description 'Deals, what they are worth, and how many of them we win'
  currency 'EUR'

  join {
    name 'cube_demo.crm_accounts'
    title 'Accounts'
    description 'The account the deal is for'
    sql '${CUBE}.account_id = cube_demo.crm_accounts.account_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.crm_sales_reps'
    title 'Sales Reps'
    description 'The rep who owns the deal'
    sql '${CUBE}.rep_id = cube_demo.crm_sales_reps.rep_id'
    relationship 'many_to_one'
  }

  dimension {
    name 'DealId'
    title 'Deal Id'
    description 'The deal number'
    sql '${CUBE}.deal_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'DealName'
    title 'Deal'
    description 'The deal name'
    sql '${CUBE}.deal_name'
    type 'string'
  }
  dimension {
    name 'Stage'
    title 'Stage'
    description 'How far the deal has got: Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost'
    sql '${CUBE}.stage'
    type 'string'
  }
  dimension {
    name 'LeadSource'
    title 'Lead Source'
    description 'Where the deal came from: Website, Referral, Outbound, Partner or Trade Show'
    sql '${CUBE}.lead_source'
    type 'string'
  }
  dimension {
    name 'DealType'
    title 'Deal Type'
    description 'New business or a renewal'
    sql '${CUBE}.deal_type'
    type 'string'
  }
  dimension {
    name 'ProbabilityPct'
    title 'Probability %'
    description 'How likely the deal is to close, as the rep sees it'
    sql '${CUBE}.probability_pct'
    type 'number'
  }
  dimension {
    name 'CreatedDate'
    title 'Created Date'
    description 'The day the deal was created'
    sql '${CUBE}.created_date'
    type 'time'
  }
  dimension {
    name 'ExpectedCloseDate'
    title 'Expected Close Date'
    description 'The day the deal is expected to close — set on every deal, open ones included'
    sql '${CUBE}.expected_close_date'
    type 'time'
  }
  dimension {
    name 'CloseDate'
    title 'Close Date'
    description 'The day the deal was won or lost. Empty while the deal is still open'
    sql '${CUBE}.close_date'
    type 'time'
  }
  dimension {
    name 'Account'
    title 'Account'
    description 'The account the deal is for'
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
  dimension {
    name 'AccountCity'
    title 'Account City'
    description 'The city the account is in'
    sql 'cube_demo.crm_accounts.city'
    type 'string'
  }
  dimension {
    name 'Employees'
    title 'Employees'
    description 'How many people the account employs'
    sql 'cube_demo.crm_accounts.employees'
    type 'number'
  }
  dimension {
    name 'Rep'
    title 'Rep'
    description 'The rep who owns the deal'
    sql 'cube_demo.crm_sales_reps.name'
    type 'string'
  }
  dimension {
    name 'Region'
    title 'Region'
    description 'The region the rep covers'
    sql 'cube_demo.crm_sales_reps.region'
    type 'string'
  }
  dimension {
    name 'RepHireDate'
    title 'Rep Hire Date'
    description 'The day the rep was hired'
    sql 'cube_demo.crm_sales_reps.hire_date'
    type 'time'
  }
  dimension {
    name 'Quota'
    title 'Quota'
    description 'What the rep is asked to sell'
    sql 'cube_demo.crm_sales_reps.quota_amount'
    type 'number'
  }

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
  measure {
    name 'AvgDealSize'
    title 'Average Deal Size'
    description 'What a deal is worth on average'
    sql '${CUBE}.amount'
    type 'avg'
    format 'currency'
  }
  measure {
    name 'WonDeals'
    title 'Won Deals'
    description 'Deals we won'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Won'"
    }
  }
  measure {
    name 'LostDeals'
    title 'Lost Deals'
    description 'Deals we lost'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Lost'"
    }
  }
  measure {
    name 'ClosedDeals'
    title 'Closed Deals'
    description 'Deals that are decided, won or lost'
    type 'count'
    filters {
      filter sql: "\${CUBE}.stage IN ('Closed Won', 'Closed Lost')"
    }
  }
  measure {
    name 'WonValue'
    title 'Won Value'
    description 'What the won deals are worth'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.stage = 'Closed Won'"
    }
  }
  measure {
    name 'OpenPipeline'
    title 'Open Pipeline'
    description 'What the deals that are still open are worth'
    sql '${CUBE}.amount'
    type 'sum'
    format 'currency'
    filters {
      filter sql: "\${CUBE}.stage NOT IN ('Closed Won', 'Closed Lost')"
    }
  }
  measure {
    name 'WinRate'
    title 'Win Rate'
    description 'Won deals as a percentage of the deals that are decided'
    sql '100.0 * ${WonDeals} / NULLIF(${ClosedDeals}, 0)'
    type 'number'
  }
  measure {
    name 'Accounts'
    title 'Accounts'
    description 'How many different accounts have a deal'
    sql '${CUBE}.account_id'
    type 'count_distinct'
  }
  measure {
    name 'Reps'
    title 'Reps'
    description 'How many different reps own a deal'
    sql '${CUBE}.rep_id'
    type 'count_distinct'
  }

  segment {
    name 'open'
    title 'Still open'
    description 'Deals that are neither won nor lost yet'
    sql "\${CUBE}.stage NOT IN ('Closed Won', 'Closed Lost')"
  }
  segment {
    name 'won'
    title 'Won'
    description 'Deals we won'
    sql "\${CUBE}.stage = 'Closed Won'"
  }
  segment {
    name 'lost'
    title 'Lost'
    description 'Deals we lost'
    sql "\${CUBE}.stage = 'Closed Lost'"
  }
  segment {
    name 'strategic'
    title 'Strategic accounts'
    description 'Deals for the accounts in the Strategic tier'
    sql "cube_demo.crm_accounts.account_tier = 'Strategic'"
  }

  hierarchy {
    name 'account_place'
    title 'Account Place'
    description 'The account country first, then the city inside it'
    levels 'AccountCountry', 'AccountCity'
  }
}

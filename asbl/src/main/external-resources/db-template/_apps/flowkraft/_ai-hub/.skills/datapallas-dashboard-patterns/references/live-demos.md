# The dashboards DataPallas ships, live

Every dashboard below is in the product: built in the Data Canvas, published to a
report id, and open in the Dashboard Demos gallery on a demo installation. They are
one company's 25 dashboards, so a reader can see how each department's page is put
together before building their own.

Generated from `config/samples/dashboard-demos.json` and the demos' own canvases:
do not edit by hand.

## A · The company at a glance

### DD01 Executive Overview (`g-dd-executive-overview`)
- **Question:** Which area needs attention this week?
- **Who:** The CEO, every Monday. **Decision:** Which area needs attention this week.
- **Finding:** Revenue is up about 18% on the same nine months last year, and everything is on target except APAC sales and receivables.
- **Tiles:** trend, progress, number x4, gauge x2, bar chart, table
- **Filters:** Year (`year`)
- **Stories:** "How did last year close?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-executive-overview` · **on its own:** `/dashboard/g-dd-executive-overview`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-executive-overview

## B · Sales

### DD02 Sales Overview (`g-dd-sales-overview`)
- **Question:** Is sales on its growth path, and what carries it?
- **Who:** The head of sales, Monday morning. **Decision:** Is sales on its growth path, and which categories, channels, countries and products carry it.
- **Finding:** Every month this year except August runs above the same month a year earlier, most of them by about a quarter; Smart Home, the newest category, has already all but caught Office Furniture for third place.
- **Tiles:** number x4, line chart, row chart x2, map, table
- **Filters:** From (`dateFrom`), To (`dateTo`), Country (`country`), Channel (`channel`)
- **Stories:** "How is Germany doing?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-sales-overview` · **on its own:** `/dashboard/g-dd-sales-overview`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-sales-overview

### DD03 Sales by Country (`g-dd-sales-by-country`)
- **Question:** Where should we invest next?
- **Who:** The country managers. **Decision:** Where to invest next: which markets carry the revenue, which carry the big orders, and which grow.
- **Finding:** Germany is the largest market, Canada grows fastest (about +49%), and Japan has the largest orders.
- **Tiles:** map x2, row chart, table
- **Filters:** Region (`region`), Countries (`countries`)
- **Stories:** "What does the APAC territory look like?" "How does Poland compare with Germany?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-sales-by-country` · **on its own:** `/dashboard/g-dd-sales-by-country`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-sales-by-country

### DD04 Sales Channels (`g-dd-sales-channels`)
- **Question:** Which channel gets the next euro of effort?
- **Who:** The e-commerce and trade sales leads, deciding the next year's channel budget. **Decision:** Which channel gets the next euro of effort: marketplace fees, the app, the web shop or the reps.
- **Finding:** The mobile app has grown from about 14% to about 28% of orders since 2024 while the marketplace has shrunk from 19% to 12%. Marketplace orders come back about twice as often as web orders (10.7% against 5.6%), and Smart Home sells mostly through the app.
- **Tiles:** pie chart, bar chart, area chart, sankey
- **Filters:** Include returns (`includeReturns`)
- **Stories:** "How does the mix look before returns?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-sales-channels` · **on its own:** `/dashboard/g-dd-sales-channels`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-sales-channels

### DD05 Product Performance (`g-dd-product-performance`)
- **Question:** Which products should we push, fix or delist?
- **Who:** The category manager. **Decision:** Which products to push, which to fix and which to delist.
- **Finding:** Products rated under 3.5 stars sell about 40% fewer units per product; the AeroDesk Pro standing desk (3.2 stars) has a 17.5% return rate since April 2026.
- **Tiles:** scatter chart, bubble chart, row chart x2, table
- **Filters:** Category (`category`), How many (`topN`)
- **Stories:** "What does the Monday meeting need?" "What is wrong in Office Furniture?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-product-performance` · **on its own:** `/dashboard/g-dd-product-performance`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-product-performance

### DD06 Seasonality & Peak Times (`g-dd-seasonality`)
- **Question:** When do we staff up, and when do we run campaigns?
- **Who:** The operations planner and marketing. **Decision:** When to staff up and when to run campaigns.
- **Finding:** Orders peak on Monday evenings, 19:00-21:00, with Monday 20:00 the busiest hour of the week, while sales-rep orders peak on Monday at 13:00. November is about 2.3 times an average month and the Black Friday days run about 4 times an average day; the 25th to the 27th of any month bring about 25% more orders than an average day, and August runs a third below an average month.
- **Tiles:** pivot, bar chart x2, line chart
- **Filters:** Channel (`channel`)
- **Stories:** "When do the sales reps sell?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-seasonality` · **on its own:** `/dashboard/g-dd-seasonality`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-seasonality

### DD07 Sales Pipeline (`g-dd-sales-pipeline`)
- **Question:** Will we make this quarter, and is next quarter safe?
- **Who:** The sales director, every week. **Decision:** Will we make this quarter, is next quarter safe, and which deals and sources need attention.
- **Finding:** Referral deals win about twice as often as paid-search deals (51% against 25%), and next quarter's pipeline covers 2.1 times its quota.
- **Tiles:** number x3, gauge, funnel chart, bar chart, table
- **Filters:** Rep (`repEmployeeId`), Closing from (`closeFrom`), Closing to (`closeTo`)
- **Stories:** "How is one rep doing?" "What still has to close this week?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-sales-pipeline` · **on its own:** `/dashboard/g-dd-sales-pipeline`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-sales-pipeline

### DD08 Targets vs Actual (`g-dd-targets-vs-actual`)
- **Question:** Which region is behind plan, and since when?
- **Who:** The CFO and the regional directors, at month end. **Decision:** Which region is behind plan, and since when.
- **Finding:** EMEA is at 103% of target and APAC at 85%, with NA and LATAM on plan.
- **Tiles:** progress x4, combo chart, gauge, pivot
- **Filters:** Year (`year`), Region (`region`)
- **Stories:** "Who is behind, and does the director still see the rest?" "Is the gap this year's?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-targets-vs-actual` · **on its own:** `/dashboard/g-dd-targets-vs-actual`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-targets-vs-actual

## C · Customers

### DD09 Customer Base & Growth (`g-dd-customer-growth`)
- **Question:** Which acquisition channels to fund, and do new customers come back?
- **Who:** The marketing lead. **Decision:** Which acquisition channels to fund, and whether new customers come back.
- **Finding:** Referral signups more than doubled after the loyalty programme of March 2025, from about 13 a month to about 29.
- **Tiles:** number x3, trend, line chart, doughnut chart, map, bar chart, table
- **Filters:** Segment (`segment`), Acquisition channel (`acquisitionChannel`)
- **Stories:** "Do the big accounts behave differently?" "What did the loyalty programme bring?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-customer-growth` · **on its own:** `/dashboard/g-dd-customer-growth`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-customer-growth

### DD10 Cohort Retention (`g-dd-cohort-retention`)
- **Question:** Did what we changed make customers stay longer?
- **Who:** The CFO and the growth team, every quarter. **Decision:** Did what we changed make customers stay longer.
- **Finding:** Cohorts from March 2025 still have 48% of their customers ordering around month 6, about 7 points more than the cohorts before it.
- **Tiles:** pivot, line chart, number
- **Filters:** Customer type (`customerType`)
- **Stories:** "How do the trade accounts read?" "And the consumers on their own?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-cohort-retention` · **on its own:** `/dashboard/g-dd-cohort-retention`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-cohort-retention

### DD11 Customer 360 (`g-dd-customer-360`)
- **Question:** What should I raise on this call?
- **Who:** An account manager, before a call. **Decision:** What to raise on the call: the money owed, the open issues, what they buy.
- **Finding:** Helix Retail Group has bought 1.6M over 31 months and pays on time 136 times out of 140 - but four invoices are overdue, the oldest of them 985 days past due.
- **Tiles:** detail, number x4, combo chart, doughnut chart, table x2
- **Filters:** Customer (`customerId`)
- **Stories:** "And a small consumer account?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-customer-360` · **on its own:** `/dashboard/g-dd-customer-360`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-customer-360

## D · Digital

### DD12 Website Traffic & Conversion (`g-dd-web-funnel`)
- **Question:** Is the site converting, where do visitors drop, and which sources pay back?
- **Who:** The digital marketing lead, daily. **Decision:** Is the site converting, where do visitors drop, and which traffic sources pay back.
- **Finding:** Mobile checkout to purchase fell from about 62% to 41% in June 2026 - a checkout bug - and was back at 62% in August; email visitors convert at 6.1%, about twice paid social's 2.7%.
- **Tiles:** number, gauge, trend, funnel chart, line chart x2, pivot, bar chart
- **Filters:** From (`dateFrom`), To (`dateTo`), Device (`device`)
- **Stories:** "What happened on mobile in June?" "Was desktop hit too?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-web-funnel` · **on its own:** `/dashboard/g-dd-web-funnel`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-web-funnel

## E · Finance

### DD13 Invoices & Billing (`g-dd-invoices`)
- **Question:** Is this month's billing complete and collected, and what is still open?
- **Who:** The accountant, at month end. **Decision:** Is this month's billing complete and collected, and what is still open.
- **Finding:** September billing is 1,098,189.32 - 98.9% of it from trade orders and 1.1% from Care plans - against 827,603.01 collected; 12.3% of the 1,637,606.29 still open is overdue.
- **Tiles:** number x4, bar chart, doughnut chart, row chart, table
- **Filters:** Status (`status`), Customer (`customerId`), Issued from (`issuedFrom`), Issued to (`issuedTo`)
- **Stories:** "What is overdue?" "And the largest account?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-invoices` · **on its own:** `/dashboard/g-dd-invoices`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-invoices

### DD14 Receivables Aging & Collections (`g-dd-receivables-aging`)
- **Question:** Whom do I call today, and is collection getting worse?
- **Who:** The credit controller, daily. **Decision:** Whom to call today, and whether collection is getting worse.
- **Finding:** Helix Retail Group owes 170,829.65 past 90 days - four invoices, and the whole of the 90+ bucket; DSO averages 50.3 days over 2026 against 43.4 in 2025.
- **Tiles:** number x2, gauge, trend, bar chart x2, row chart, table
- **Filters:** Minimum amount (`minAmount`), Account manager (`accountManagerId`)
- **Stories:** "Which arrears are worth a call?" "And one manager's own book?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-receivables-aging` · **on its own:** `/dashboard/g-dd-receivables-aging`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-receivables-aging

### DD15 Subscriptions: MRR & Churn (`g-dd-subscriptions-mrr`)
- **Question:** Is recurring revenue growing, and is churn under control after the price change?
- **Who:** The head of subscriptions, monthly. **Decision:** Whether recurring revenue is growing, and whether churn is under control after the price change.
- **Finding:** February 2026 was the worst month of the year for retention - every cohort kept less of itself, and price is the reason 86 subscribers gave when they left - yet MRR is at a new high of 99,781.43, with 8,102.58 of it won back by expansion over the last 12 months.
- **Tiles:** trend, number, gauge, waterfall chart, bar chart, area chart, pivot
- **Filters:** Plan (`plan`)
- **Stories:** "And the plan the price change hit hardest?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-subscriptions-mrr` · **on its own:** `/dashboard/g-dd-subscriptions-mrr`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-subscriptions-mrr

### DD16 Profit & Margin (`g-dd-profit-margin`)
- **Question:** Is discounting worth what it costs in margin?
- **Who:** The CFO, quarterly board pack. **Decision:** Whether discounting is worth what it costs in margin.
- **Finding:** Q4 discounting costs about six points of margin every year: the discount rate runs near 6% for three quarters and 14.5% in Q4, and margin falls from 33.49% to 27.94% in 2024 and from 35.35% to 29.03% in 2025 - every category gives ground, Laptops most of all.
- **Tiles:** number x3, combo chart, waterfall chart, pivot
- **Filters:** From (`dateFrom`), To (`dateTo`), Category (`category`)
- **Stories:** "Which categories pay for the discounting?" "And what did last Q4 cost?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-profit-margin` · **on its own:** `/dashboard/g-dd-profit-margin`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-profit-margin

## F · People

### DD17 Payroll Cost (`g-dd-payroll`)
- **Question:** Is payroll growing because of more people or higher pay, and where does overtime cost money?
- **Who:** The HR and finance controller, monthly. **Decision:** Whether payroll is growing because of more people or higher pay, and where overtime costs money.
- **Finding:** Payroll grew because Engineering hired: 20 engineers joined in 2025 against 4 who left, 40 people became 56, and of the 17,000.63 a month the department costs more than a year ago, 23,530.06 is the extra people and -6,529.43 is pay - the new engineers came in below its average. Overtime is the other pressure and it is the warehouse's: about 180 hours a month, then 539.9 in November 2025 and 531.3 in December, 2.98 times the rest of the year.
- **Tiles:** number x3, bar chart, doughnut chart, line chart, table
- **Filters:** Period (`period`), Department (`department`)
- **Stories:** "Where do the overtime hours sit?" "And a November, when the warehouse works nights?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-payroll` · **on its own:** `/dashboard/g-dd-payroll`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-payroll

### DD18 Headcount & Attrition (`g-dd-headcount`)
- **Question:** Where do people leave, and what would have to change to keep them?
- **Who:** The HR director, quarterly. **Decision:** Where people leave, and what to change to keep them.
- **Finding:** Customer Support is where people leave: 17.5% a year against 9.64% for the company over the 33 months, 12 leavers from a team that averaged 25 people, and the shortest median tenure of any department at 3.1 years - 8 of its 26 people have been there under a year. Pay is the likely reason: at L1, where 10 of those 26 sit, it pays 81.7% of what everyone else at that level is paid, a median of 27,891 against 32,270; pooled over L1 to L3 it is 92.02%.
- **Tiles:** number x3, line chart, bar chart x2, boxplot chart
- **Filters:** Department (`department`), Country (`country`)
- **Stories:** "Which team is losing people?" "And the largest country?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-headcount` · **on its own:** `/dashboard/g-dd-headcount`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-headcount

## G · Operations

### DD19 Inventory & Stock Health (`g-dd-inventory`)
- **Question:** What do we reorder today, where does it fit, and what stock should we clear?
- **Who:** The purchasing manager, daily. **Decision:** What to reorder today, where it fits, and what stock to clear.
- **Finding:** 14 SKUs are below their reorder level, 4 of them in Rotterdam, and Rotterdam is the warehouse with no room left: 94% of capacity against 71% in Frankfurt and 52% in Sao Paulo. 62,110.83 sits in 9 slow movers that have not sold in 90 days, none of them worth more than 6,979.31 on its own, and every one of them is in a different building - so the money to free is spread thin while the space problem is in one place.
- **Tiles:** number x3, bar chart, row chart, table
- **Filters:** Warehouse (`warehouse`), Below reorder level only (`belowReorderOnly`), Category (`category`)
- **Stories:** "Rotterdam has no room - what is in it?" "And everything we hold, not just what is short?" "Just the buying area I look after?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-inventory` · **on its own:** `/dashboard/g-dd-inventory`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-inventory

### DD20 Fulfillment & Delivery (`g-dd-fulfillment`)
- **Question:** Is lateness a carrier problem or a country problem, and which orders do we chase?
- **Who:** The logistics manager, daily and at the carrier review. **Decision:** Whether lateness is a carrier problem or a country problem, and which orders to chase.
- **Finding:** Lateness is a carrier, not a country: SwiftPost is late 12.3% of the time against 4.28% for the other two over every delivery on the books - 12.38% against 4.25% and 3.05% in the last 90 days - and it is the worse carrier in all 18 countries where it delivers at least 60 parcels a year, from 7.56% in the Netherlands to 20% in Sweden. When it is late the parcel arrives 3.51 days late, against about a day and a half for the others, which is why its delivery-days box has the long tail.
- **Tiles:** gauge, number x2, trend, bar chart, boxplot chart, map, table
- **Filters:** From (`dateFrom`), To (`dateTo`), Carrier (`carrier`)
- **Stories:** "Is it one carrier?" "And over the year, not the quarter?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-fulfillment` · **on its own:** `/dashboard/g-dd-fulfillment`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-fulfillment

### DD21 Support Operations (`g-dd-support-operations`)
- **Question:** Who works when, and which tickets do we pick up today?
- **Who:** The support lead, at the daily stand-up. **Decision:** Who works when, and which tickets get picked up today.
- **Finding:** Mondays 09:00-11:00 are the peak - 1,059 tickets in those three cells against 83.33 for an average hour of the week - and urgent SLA breaches spiked in June 2026 with the checkout bug: 26.32% of that month's urgent tickets breached against 8.64% in every other month, 3.05 times the rate. The queue itself is small and slightly growing: 127 open, of which 40 are urgent or high and the oldest has been waiting 45 days, and over the 142 full weeks 13,868 tickets came in against 13,770 resolved.
- **Tiles:** number x3, gauge, pivot, line chart, bar chart, table
- **Filters:** Priority (`priority`), Team (`team`)
- **Stories:** "What is urgent right now?" "And my billing team?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-support-operations` · **on its own:** `/dashboard/g-dd-support-operations`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-support-operations

### DD22 Support Quality & Agents (`g-dd-support-quality`)
- **Question:** Which channel should we steer customers to, and which agents need coaching?
- **Who:** The head of support, at the monthly review. **Decision:** Which channel to steer customers to, and which agents to coach.
- **Finding:** Chat leaves people happiest and no faster: CSAT 4.4 on chat against 4.07 on the phone, 3.83 by email and 3.67 on the web form, while a ticket takes 60 to 63 hours to resolve whichever channel it arrives on - chat's median, 62.63 hours, is the longest of the four against the web form's 60.28. So chat buys satisfaction, not speed. Every team clears the 90% SLA target, from 90.5% in Billing to 91.5% in Technical, and the 32 agents sit between 3.86 and 4.13 CSAT, so there is no one to single out for coaching.
- **Tiles:** trend, progress, number, boxplot chart, bar chart, table
- **Filters:** Team (`team`), From (`dateFrom`), To (`dateTo`)
- **Stories:** "And my technical team?" "Who needs coaching?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-support-quality` · **on its own:** `/dashboard/g-dd-support-quality`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-support-quality

## H · The analyst's toolkit

### DD23 Table Profile (`g-dd-table-profile`)
- **Question:** Can I trust this table, and which of its columns can I use?
- **Who:** The analyst meeting a new table. **Decision:** Whether the table can be trusted, and which columns can be used.
- **Finding:** Pick any table and you know it in half a minute: support_tickets holds 14,000 rows over 15 columns, 476 of them opened in the last 30 days, and 4 columns have gaps - order_id is empty on 52.64% of tickets, because a ticket need not be about an order, and csat_score on 58.33%, because most people never answer the survey. Its priority column is 51.56% normal and 8.21% urgent. Point the same page at orders.total_amount and the chart turns into twenty ranges over 23,162 distinct amounts, 20,782 orders inside the first one.
- **Tiles:** number x4, table, bar chart
- **Filters:** Table (`tableName`), Column (`columnName`)
- **Stories:** "And a number column, on the biggest table?" "Why are a quarter of the columns empty here?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-table-profile` · **on its own:** `/dashboard/g-dd-table-profile`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-table-profile

### DD24 One Metric, Every Angle (`g-dd-metric-deep-dive`)
- **Question:** Is each of the company's five metrics where it should be, and what drives it?
- **Who:** The COO, at the monthly business review, walking through the five metrics one at a time. **Decision:** Whether each metric is where it should be, and what drives it.
- **Finding:** Revenue is 17.5% up on the same span of last year and orders 27.55% up, while tickets grow 10.32% - support scales with the business rather than with the order book. Orders growing faster than revenue is the other half of that sentence: the average order is smaller than it was. November is the biggest month of the year for both, 8,273,224.34 and 3,165 orders against a May second place of 5,920,290.39, while payroll peaks in March and new customers in September. Germany leads all five metrics, revenue 3,651,821.21 of the 18,326,301.98 year to date.
- **Tiles:** trend, number x2, line chart, row chart x2, bar chart
- **Filters:** Metric (`metric`)
- **Stories:** "Orders, then - are we selling more or just dearer?" "And is support keeping up?" "What about the cost side?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-metric-deep-dive` · **on its own:** `/dashboard/g-dd-metric-deep-dive`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-metric-deep-dive

### DD25 Segment vs Everyone (`g-dd-segment-vs-all`)
- **Question:** Is my country different from the company as a whole, and where?
- **Who:** A country manager: "is my country different?" **Decision:** What to do differently in my market: assortment, channel, price.
- **Finding:** Poland is a smaller basket and a faster market: 1,944.91 an order against 2,756.55 everywhere, returns no different at 5.93% against 5.97%, but quarterly revenue at 208.67 against the company's 139.44 since the start of 2024. It buys more Smart Home, 12.2% of its revenue against 10.58%, and a little more on the app, 21.37% of its orders against 20.55% - the assortment difference is real, the channel difference is under a point.
- **Tiles:** number x4, bar chart, line chart, pie chart
- **Filters:** Country (`country`)
- **Stories:** "And the biggest market - is it the average?" "And a market on the other side of the world?"
- **In the gallery:** `/dashboard/g-dashboard-demos#dd-segment-vs-all` · **on its own:** `/dashboard/g-dd-segment-vs-all`
- **How it was built:** https://datapallas.com/docs/dashboard-demos/dd-segment-vs-all

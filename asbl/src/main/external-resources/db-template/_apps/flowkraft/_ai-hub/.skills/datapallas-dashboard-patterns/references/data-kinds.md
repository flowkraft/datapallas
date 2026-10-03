# Data kinds: what a table is, and which dashboards and cards it supports

Step 3 and step 4 of the method. A **kind** is what a table *is* to the business, decided from its columns' roles (`column-roles.md`) and its place in the reference graph. Each kind comes with the dashboards that suit it (by demo id; `live-demos.md` has each one's link) and the **full list of cards** it can hold.

## How to decide a kind

1. **Facts point to many; entities are pointed to.** Build the reference graph (declared foreign keys, then `<name>_id` names). A table with several references, a date and a measure is a **fact**: something that *happened*. A table many others point to is an **entity**: something that *exists*. A fact's measures are what dashboards add up; an entity's attributes are what dashboards split by.
2. **A fact has one event date.** Which date it is (created, opened, issued, started) names the kind.
3. **Say it in words and show the evidence:** *"`Orders` has `OrderDate`, a reference to `Customers` and `Employees`, and `Order Details` carries the money: these are transactions."*
4. **A table can be two kinds** (an orders table is transactions and also carries fulfilment dates). I list both and let the second be a second dashboard.
5. **When nothing fits,** the table is probably reference data (a lookup of countries, categories, departments): an entity that lends its names to the others, not a dashboard of its own. Or it is a data-modelling problem: no date and no key means there is nothing to count over time. I say that plainly.

## How to read each kind below

- **Recognise it:** the roles that give it away.
- **Dashboards:** the ones that suit it, with the person and the decision.
- **Cards:** every card the kind can hold, each with **the question that makes it worth showing** and **the columns (slots) it needs**. A card whose slots the data cannot fill is dropped; a card whose question nobody asks goes to "also possible".
- A page holds about 14 widgets, so I never offer a kind's whole list as one dashboard. The list is what I choose *from*.

---

## 1 · Transactions: many references + an event date + money

**Recognise it:** an order, sale, line item or payment table: references to a customer and often a product, an event date, an amount, a quantity, usually a channel and a place. In a classic schema it is a header table plus a lines table (`Orders` + `Order Details`): the header carries the date and the customer, the lines carry the money and the product, and I read them together.

**Dashboards:** Sales Overview **DD02** (the head of sales: is sales on its growth path, and what carries it); Sales by Country **DD03** (country managers: where to invest); Sales Channels **DD04** (channel leads: where the next euro goes); Product Performance **DD05** (the category manager: push, fix or delist); Seasonality & Peak Times **DD06** (the planner: when to staff up and run campaigns); Profit & Margin **DD16** (the CFO: is discounting worth its margin); Segment vs Everyone **DD25** (a country manager: is my market different).

| Card | The question that makes it worth showing | Slots it needs |
|---|---|---|
| Total revenue, orders, average order value, buyers (a KPI row) | How big is it, how many, how big is each one, how many people | event date, money, id, customer reference (`COUNT(DISTINCT customer)`) |
| Revenue per period (line) | Is it growing, and is this month above the same month last year | event date, money (≥ 1 year of dates for the year-over-year read) |
| Revenue by category / product group (row or bar) | What carries the business | money, a category on this table or on the entity it points to (the product) |
| Revenue by channel / source (row, pie if ≤ 5) | Which route to market pays | money, a channel or source column |
| Revenue by country (map) | Where it sells | money, country or country code |
| Top N products or customers (table) | Who carries the revenue, and how concentrated is it | money, the reference to the product or customer, a name in that entity |
| Channel share over time (stacked area) | Is the mix moving | event date, a channel with ≤ 5–6 values |
| Channel → category (flow / sankey) | What does each channel sell | channel, category, money |
| Orders by city (pin map) | Where inside a market the orders come from | city with latitude and longitude |
| Growth by country (table: this year to date against the same period last year) | Who is growing, and who is merely big | event date, money, country; countries with few orders folded into "Other" so a growth % is not noise |
| Weekday × hour (heatmap) | When do people buy | a **timestamp** with an hour (a date alone cannot) |
| Month of year; day of month (bars) | The campaign calendar, the payday effect | event date |
| One peak, day by day (line) | Last year's biggest period, to plan this year's | event date over a year-long history |
| Rating against units sold; discount against return rate (scatter, bubble) | What moves with what: do bad ratings cost sales, do deep discounts hide defects | a score or rate per product, a quantity, a return flag or amount |
| Top N and bottom N by margin | The push list and the review list | money and a cost (`unit_cost`, `line_cost`) per product |
| Margin % per period, with revenue (combo, second axis) | Is profit keeping up with sales | money, cost, event date |
| Revenue → cost → discounts → shipping → profit (waterfall) | Where the money goes between revenue and profit | money, cost, discount, shipping/fee columns |
| Discount rate and margin by quarter (pivot) | Which categories give up margin when discounting peaks | discount, cost, category, event date |
| A segment against everyone (grouped bar, index line) | Is this market different, and where | any category, plus one chosen value of another |

**Across the references:** revenue by the customer's **segment or country**, by the product's **category or brand**, by the employee's **department** (a rep's sales), by the carrier's **name**. The measure is on the fact; the attribute is on the entity it points to. Say which join it takes.

**Not asked for here:** an average quantity per month or an average discount per month rarely moves a decision for the person who reads sales; I leave them out unless someone argues for them.

---

## 2 · Customers: pointed to by many + a signup date

**Recognise it:** a table with a name, a country or city, a segment or type, an acquisition channel, a signup date, often a credit limit or payment terms, and referenced by orders, invoices, tickets.

**Dashboards:** Customer Base & Growth **DD09** (the marketing lead: which channels to fund, do new customers come back); Cohort Retention **DD10** (the CFO and the growth team: did what we changed make customers stay); Customer 360 **DD11** (an account manager before a call: what to raise); Segment vs Everyone **DD25**.

| Card | The question | Slots |
|---|---|---|
| Customers; new in the last 30 days; repeat buyers % | How big is the base, what came in this month, do they return | id, signup date, a count of orders per customer |
| New customers per month (trend / line) | Is acquisition accelerating | signup date |
| New per month by acquisition channel | Which channel brings them, and did a change move it | signup date, an acquisition channel (small channels folded into "Other" so no line is jagged) |
| Segment mix (doughnut) | Who are they | segment or type with ≤ 5 values |
| Customers by country (map) | Where they are | country or code |
| Customers by lifetime orders (binned bars) | How many buy once, how many keep buying | orders per customer (an aggregate of an aggregate; SQL) |
| Newest customers with channel and first order (table) | The list marketing exports for onboarding | name, signup date, channel, first order from the orders |
| Cohort retention (heatmap) | Of the people who arrived in a given month, how many still order N months later | signup date, the orders' event date; **monthly cohorts when there are many customers, quarterly when a cohort would hold fewer than about 100** |
| Retention curve for chosen cohorts; average retention at month 6 | Did the change make customers stay | the same |
| One customer's profile, lifetime revenue, open invoices, open tickets, plan, orders per month, spend by category, last orders, tickets | What do I raise on this call | a customer reference in every fact: orders, invoices, tickets, subscriptions |

**Across the references:** orders per customer segment; revenue and ticket volume **by acquisition channel** (does the cheap channel bring people who open the most tickets); overdue amount per customer.

---

## 3 · Events: a stream of timestamped things (web sessions, clicks, tickets as they arrive)

**Recognise it:** a very long table with a timestamp, a type or source, a device or country, and little money. Two flavours:

- **Visits and clicks** (web sessions, page views): a source, a device, a few boolean steps (reached product, reached cart, reached checkout, purchased).
- **Tickets and requests:** opened and resolved timestamps, a priority, a channel, an agent, an SLA, a satisfaction score. These also have a *lifecycle*: open until resolved.

**Dashboards:** Website Traffic & Conversion **DD12** (the digital lead: is the site converting, where do visitors drop, which sources pay back); Support Operations **DD21** (the support lead: who works when, which tickets today); Support Quality & Agents **DD22** (the head of support: which channel to steer to, which agents to coach).

| Card | The question | Slots |
|---|---|---|
| Volume; the recent window ("last 7 days") | How much, and what came in since last time | timestamp; the recent window **only when the page has no period filter and the reader acts on recent change** |
| Open tickets, open urgent/high, oldest waiting | What is waiting | status, priority, opened-at, resolved-at being NULL |
| Created vs resolved per week (line) | Does the backlog grow | opened-at, resolved-at |
| Weekday × hour (heatmap) | When does the load come, which sets the rota | a timestamp with hours |
| Open backlog by priority (stacked bar) | Where the backlog sits | status, priority (kept in order) |
| First response time; resolution time by channel (boxplot) | How fast do we answer and resolve, and how spread is it | opened-at, first-response-at, resolved-at; the median, never the mean alone, because durations skew |
| SLA met % (gauge); urgent breaches per month | Are we keeping the promise | an SLA breached flag or SLA hours with the two timestamps |
| CSAT by channel; CSAT per month; reopened % | Where do people leave happiest | a score, a channel; the reopened flag |
| Agent leaderboard (table) | Who needs coaching, who to learn from | an agent reference with a name, tickets, resolution time, CSAT, SLA; **only when the number of tickets per agent is large enough to mean something** |
| Funnel: session → product → cart → checkout → purchase | Where do visitors drop | the boolean steps, in order |
| Conversion by traffic source; by device | Which sources pay back, where is the bug | source, device, the purchased flag |
| A step's rate per month (line) | Did something break | the same, bucketed **monthly** unless the volume is large enough for weekly |
| Sessions per week by device | Is mobile healthy | timestamp, device (weekly, not daily, when volume is thin) |

**If the data is a sample** (a 1-in-N slice of sessions, as analytics tools take), I say so on the dashboard: rates inside the sample are unbiased, counts must be scaled by the rate and labelled as estimates.

**Across the references:** tickets by **customer segment** or by the **product's category**; sessions' conversion by the **customer's country**; resolution time by the agent's **team**.

---

## 4 · Invoices: a number + issued + due + amount + paid

**Recognise it:** an invoice or bill table: an invoice number, a customer, an issue date, a **due date**, an amount, a status, a paid date; sometimes a separate payments table (several payments per invoice). Receivable (we are owed) and payable (we owe) look the same; the direction is the only difference, and I ask which it is.

**Dashboards:** Invoices & Billing **DD13** (the accountant at month end: is billing complete and collected, what is open); Receivables Aging & Collections **DD14** (the credit controller: whom to call today, is collection getting worse).

| Card | The question | Slots |
|---|---|---|
| Billed this month; collected this month; open amount; overdue amount | Is the month complete and collected | amount, issue date, paid date or payments, status, due date |
| Billed per month by status (stacked bar) | Are older months still open | issue date, status, amount |
| Billed by source (doughnut) | Where does billing come from (orders, plans, services) | a source or type column |
| Top 10 customers by billed amount | How concentrated is the money | customer reference, amount |
| Invoice list with status filter (table) | The list to reconcile | number, customer name, dates, amount, status |
| Aging buckets: current, 1–30, 31–60, 61–90, 90+ | How old is the debt | due date, open amount, today |
| Aging by customer segment (stacked bar) | Which kind of customer pays late | the buckets, a segment from the customer |
| Overdue 90+ ; customers overdue; current % (number, gauge) | How bad is it | the same |
| DSO per month (trend) | Is collection getting worse | receivables, credit sales, period (`sql-shapes.md`) |
| Top overdue customers; overdue invoices with days overdue (row chart, table) | The call list: customers first, then invoices | the buckets, customer names, a minimum-amount filter |

**Across the references:** open amount by the customer's **account manager**, by **country**, by **payment terms**.

---

## 5 · Subscriptions: start + cancel + a recurring amount

**Recognise it:** a plan, a recurring amount (MRR), a start date, a cancel date (NULL while active), a cancel reason, often a table of changes (upgrades, downgrades).

**Dashboards:** Subscriptions: MRR & Churn **DD15** (the head of subscriptions: is recurring revenue growing, is churn under control).

| Card | The question | Slots |
|---|---|---|
| MRR per month (trend); active subscribers | Where is recurring revenue, and which way | recurring amount, start and cancel dates |
| Churn last month (gauge, **higher is worse**) | Are we losing people faster | cancel date, active at the start of the month |
| MRR movement over 12 months (waterfall: new, expansion, contraction, churn) | What moved MRR | the changes table, or the differences month on month (`sql-shapes.md`) |
| Churn reasons (bar) | Why people leave | a cancel reason |
| MRR by plan (stacked area) | Which plans carry it | plan, recurring amount, dates |
| Subscriber cohort retention (heatmap) | Did a price change hit old customers too (a vertical stripe) | start date, cancel date |
| Net revenue retention; average revenue per account | Do existing customers grow | the same, plus a customer reference |

**Across the references:** churn by the customer's **segment or country**; MRR by the **plan's** attributes; tickets opened by subscribers before they cancel.

---

## 6 · People: an employee + a period + pay

**Recognise it:** an employee table (department, level, hire date, termination date, salary) and a payroll table (employee, month, gross, bonus, overtime, taxes, net). **These are the most sensitive tables a dashboard meets**: one person's pay is never listed, and a small group's average can identify someone.

**Dashboards:** Payroll Cost **DD17** (the HR and finance controller: more people or higher pay; where overtime costs money); Headcount & Attrition **DD18** (the HR director: where people leave and why).

| Card | The question | Slots |
|---|---|---|
| Payroll cost in the period; average gross pay; overtime hours | What the month cost | period, gross pay, overtime hours (aggregates only) |
| Cost per month by department (stacked bar) | Which department drives the trend | period, a department through the employee reference |
| Cost components: base, bonus, overtime, taxes, benefits (doughnut) | What the cost is made of | the component columns |
| Cost change on last year by department: from more people, from higher pay (table) | Is payroll growing because of headcount or pay | headcount and average pay per department, two years |
| Overtime hours over time, one department (line) | Where overtime costs money, and when | overtime hours, period, department |
| Headcount; hires; leavers (numbers) | The size and the flow | hire date, termination date |
| Headcount over time (line) | Are we growing | hire and termination dates (a month series) |
| Attrition rate by department (bar) | Where do people leave | leavers over average headcount, **over the whole history, annualised, never one year of a small team**; departments under about 15 people grouped as "Corporate" |
| Salary by level, one team against the rest (boxplot) | Is pay the reason | level, salary; **only for groups large enough that nobody is identifiable** |
| Tenure in bins | How long do people stay | hire date, termination date |

**Across the references:** everything is by the **department** the employee belongs to, and by the country and city of their location. A payroll line has no department of its own.

---

## 7 · Inventory: on hand + a reorder level

**Recognise it:** a product (or SKU) with a stock level and a **reorder level**, often by warehouse, plus movements (receipts, sales, adjustments), a last-sold and a last-received date, and sometimes a capacity per warehouse.

**Dashboards:** Inventory & Stock Health **DD19** (the purchasing manager: what to reorder today, where it fits, what to clear).

| Card | The question | Slots |
|---|---|---|
| Stock value | How much money is in stock | quantity on hand, unit cost |
| SKUs below reorder level | How big is today's job | on hand, reorder level |
| Slow-mover value, no sale in 90 days | How much money is stuck | last sold date, stock value |
| Space used by warehouse, % of capacity (bar) | Where is there room | quantity, capacity per warehouse |
| Slow movers by value (row) | What to clear | the slow-mover rule, value |
| Stock by SKU: on hand, reorder level, suggested order (table, "below reorder only" on by default) | The list to act on | product name, on hand, reorder level, reorder quantity |
| Stock turnover; days of cover | Is stock moving | sales per period, stock on hand |
| Movements over time by type | What flows in and out | the movements table |

**Across the references:** stock by the product's **category** and **supplier**, by **warehouse** and its city.

---

## 8 · Pipeline: stage + amount + close date

**Recognise it:** an opportunity, deal or lead table: a stage, an amount, a probability, a created date, an expected close date, a closed date (NULL while open), an owner, a lead source; plus quotas per owner and period.

**Dashboards:** Sales Pipeline **DD07** (the sales director: will we make this quarter, is next quarter safe); Targets vs Actual **DD08** (the CFO and the regional directors: which region is behind plan, and since when).

| Card | The question | Slots |
|---|---|---|
| Open pipeline; weighted pipeline | What could close | amount, probability, closed date NULL |
| Quota attainment this quarter (gauge) | Will we make it | closed-won amount, a quota per owner and period |
| Next quarter's pipeline ÷ its quota | Is next quarter safe | amount, expected close date, quota |
| Deals by stage (funnel) | Where do deals stall | stage, in order |
| Win rate by lead source (bar) | Which sources are worth feeding | lead source, won vs lost |
| Open deals closing this quarter (table) | What to chase this week | owner, close range |
| Actual against target per month, per region (combo, progress, variance heatmap) | Who is behind, and which months made the gap | a target table by period and region, the actual from the transactions |

**Across the references:** pipeline by the **customer's** segment or country, by the owner's **team**.

---

## Supporting tables (not kinds of their own)

- **Targets, quotas, budgets** (period + area + a target value): the line a measure is judged against. They turn a number into a gauge or a progress bar, and a trend into a combo. Offer them only if the data has them.
- **Reference data** (countries, cities, categories, departments, warehouses, carriers): entities that give names to the facts' references. They make a chart readable; they do not get a dashboard.
- **Calendar tables:** useful for fiscal periods; otherwise ignored.

---

## The analyst's toolkit: dashboards that do not depend on a kind

These work on **any** table or fact, and I offer them when the user does not yet know what to ask:

- **A table's profile (DD23, the analyst meeting a new table):** rows, columns, the freshest rows, columns with NULLs, and for each column its type, a role guessed from its name, NULLs, distinct values, min, average, max; plus the distribution of one picked column (top 20 values, or numeric bins). *Question: can I trust this table, and which columns can I use?*
- **One metric, every angle (DD24):** one number seen five ways: now and against last year, over time, what it is made of, month of year, by country. *Question: is each metric where it should be, and what drives it?* Weekday and hour are left out for monthly metrics.
- **A segment against everyone (DD25):** one country, one segment or one product set against the whole company: order value, return rate, category share, an index over time, the channel mix. *Question: is mine different, and where?* Needs a segment with enough rows for a quarterly line to be readable.
- **What moves with what:** two measures per entity as a scatter or bubble. Only pairs with a decision behind them (rating against sales; discount against returns).
- **Cross-department (DD01, the executive board):** one headline number per area, each with its own dashboard behind it, and the areas off target listed last. *Question: which area needs attention this week?* Needs more than one kind in the same database and a table of targets to judge against.

## Zoom-ins and what to offer next

A dashboard has deeper siblings; I offer them as the next step:

- **Transactions:** by country (DD03), by channel (DD04), by product (DD05), over time (DD06), margin (DD16).
- **Customers:** growth (DD09) → retention (DD10) → one customer's record (DD11).
- **Money owed:** billing (DD13) → aging and collections (DD14).
- **Support:** operations (DD21) → quality (DD22).
- **Any fact:** a segment against everyone (DD25), one metric every angle (DD24), the table's profile (DD23).

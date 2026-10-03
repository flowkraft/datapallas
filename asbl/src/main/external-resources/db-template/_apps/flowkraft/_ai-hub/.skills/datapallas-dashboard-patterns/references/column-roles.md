# Column roles: what a column is for, from its name and its type

Step 2 of the method. A **role** says what a column can do on a dashboard: be summed, be a date axis, be a category to split by, be a place on a map, or be left alone. I read it from the **name first, the type second**, and when I can I confirm it with a profiling query (distinct values, range, NULL rate).

A name is a hint, not a fact. `value` may be money or a rating; `date` may be an order date or a birth date. When two readings are plausible I say so, pick the likelier one, and ask if the dashboard depends on it.

Names are matched in any case and with any separator: `due_date`, `DueDate`, `dueDate` and `Due Date` are the same hint. Words in other languages are worth a guess when the rest of the schema is in that language (`fecha`, `importe`, `kunde`).

---

## 1 · The roles

### Identity and links

| Role | Name hints | Type | What a dashboard does with it |
|---|---|---|---|
| **id** (a row's own key) | `id`, `<table>_id`, `<Table>ID` that is the table's first column or its only unique one, `uuid`, `guid`, `no`, `number`, `code`, `sku`, `invoice_no` | integer, text | `COUNT(DISTINCT …)` to count things; never summed, never an axis. A readable number or code (an invoice number, a SKU) is a good column in a list |
| **reference** (points at another table) | `<name>_id`, `<Name>ID`, `<name>_key`, `<name>_fk`, `<name>_no` where `<name>` is, or is close to, another table | integer, text | The join to the entity's attributes. Inferred from the name when no foreign key is declared; I say so |
| **owner / author / creator** (a reference to a person) | `owner_id`, `assigned_to`, `agent_id`, `rep_id`, `employee_id`, `account_manager_id`, `created_by`, `author`, `manager_id`, `reports_to` | integer | A "by person" split, a filter for one person's own view. Shown by the person's **name**, never by the id |
| **company / vendor** | `company`, `company_name`, `vendor`, `supplier`, `supplier_id`, `organisation`, `account` | text, integer | A category to rank or a filter. Often high-cardinality: a list to pick from, a top N, never every value on an axis |

### Time

A date column is only useful once I know **what happened on that date**. The name tells me.

| Role | Name hints | What it drives |
|---|---|---|
| **created-at / event-at** (when the thing happened) | `created`, `created_at`, `order_date`, `ordered`, `placed`, `issued`, `issue_date`, `invoice_date`, `opened`, `opened_ts`, `timestamp`, `ts`, `event_time`, `started`, `sale_date`, `transaction_date` | The **time axis**: the trend, the hero chart, the seasonality, the period filter. A fact table has exactly one of these that is *the* date; I call it the fact's **event date** |
| **joined / signup** | `signup`, `signup_date`, `registered`, `joined`, `hire_date`, `start_date`, `member_since`, `first_order` | The axis of **growth and cohorts** (new per month; retention by the month someone arrived) |
| **due-at** | `due`, `due_date`, `due_on`, `expected_close_date`, `required_date`, `promised_date`, `deadline`, `scheduled`, `sla_due` | A promise. Compared with its twin below: late = done after due, overdue = not done and due has passed |
| **closed-at / done-at** | `paid`, `paid_date`, `paid_on`, `last_paid_date`, `closed`, `closed_date`, `resolved`, `resolved_ts`, `shipped`, `shipped_date`, `shipped_ts`, `delivered`, `delivered_ts`, `completed`, `cancel_date`, `terminated`, `termination_date`, `churned`, `left` | The end of a lifecycle. NULL means *still open*. With a created-at it gives a **duration**; with a due-at it gives **on-time %** or **overdue** |
| **lifecycle only** (never an axis) | `updated`, `updated_at`, `modified`, `last_modified`, `last_seen`, `deleted`, `deleted_at`, `synced_at`, `etl_loaded_at` | **Bookkeeping, not business events.** An updated-at moves when someone fixes a typo and a deleted-at marks removal, so neither drives a time series. I never build a trend on them |
| **period** | `period`, `month`, `period_month`, `quarter_start`, `fiscal_year`, `year`, `week` | A pre-bucketed time axis (payroll by month, targets by month). Already at its grain: I do not bucket it again |
| **date part** | `hour`, `weekday`, `day_of_week`, `month_no` | Seasonality, if the data has no fuller timestamp |

**Types.** `DATE`, `TIMESTAMP`, `DATETIME` are dates. An integer or a text column that *behaves* like a date is a trap: **SQLite and some legacy schemas store dates as epoch milliseconds or as text**, so a naive date filter matches nothing. When a "date" column is an integer (or a very large one), I say so and write the SQL for that form (`sql-shapes.md` notes it where it matters).

**Durations.** A column named `duration`, `elapsed`, `_sec`, `_secs`, `_seconds`, `_min`, `_minutes`, `hours`, `_hrs`, `lead_time`, `handling_time`, `resolution_time`, `tenure`, `age`, `days_*` is a measure in a unit. I read the unit from the suffix and say it in the card's title. Where there is no such column but there are two timestamps, the duration is their **difference**, and I say which two.

### Amounts and counts

| Role | Name hints | Type | What it does |
|---|---|---|---|
| **money** | `amount`, `total`, `subtotal`, `price`, `unit_price`, `cost`, `unit_cost`, `revenue`, `sales`, `gross`, `net`, `fee`, `freight`, `shipping`, `tax`, `discount_amount`, `balance`, `salary`, `base_pay`, `bonus`, `overtime_pay`, `credit_limit`, `budget`, `mrr`, `arr`, `payment`, `commission` | decimal, numeric, money, float | **Summed** (a total), averaged (a typical value) and formatted as currency. If there is a currency column I split by it, never add two currencies |
| **quantity** | `qty`, `quantity`, `units`, `count`, `seats`, `items`, `pieces`, `volume`, `weight`, `pages_viewed` | integer | Summed (units sold) or averaged |
| **stock level** | `qty_on_hand`, `units_in_stock`, `on_hand`, `stock`, `inventory`, `units_on_order`, `reorder_level`, `reorder_point`, `reorder_qty`, `capacity` | integer | A **snapshot**, never summed over time. `on_hand` against `reorder_level` is the inventory test |
| **rate / percent** | `rate`, `pct`, `percent`, `percentage`, `ratio`, `share`, `discount_pct`, `probability_pct`, `margin`, `conversion`, `utilisation` | decimal | **Never summed.** Averaged with care (a weighted average, or recomputed from its parts), formatted as a percent. A 0–1 and a 0–100 scale are both common: I check the maximum |
| **score** | `score`, `rating`, `csat`, `nps`, `stars`, `grade`, `priority_score`, `sentiment` | integer, decimal | Averaged, or shown as a distribution; **never summed**. A rating against units sold is a classic pair |
| **recurring** | `mrr`, `arr`, `monthly_fee`, `plan_price`, `recurring_amount`, `seats` | decimal | The base of a subscription dashboard. Its change over time (new, expansion, contraction, churn) is the story |
| **SLA / target** | `sla`, `sla_hours`, `sla_breached`, `target`, `quota`, `goal`, `budget`, `plan` | number, boolean | The line a measure is judged against: a gauge, a progress bar, a target line |
| **flag** | `is_*`, `has_*`, `active`, `discontinued`, `reopened`, `purchased`, `sla_breached`, `returned`, `paid`, `churned` | boolean, 0/1, text `Y/N` | A **rate** when averaged (the share of tickets reopened), a filter when ticked |

### Categories and places

| Role | Name hints | What it does |
|---|---|---|
| **status** | `status`, `state`, `stage`, `phase`, `step`, `outcome`, `result` | A category with a few values and an order: a stacked bar, a funnel (when the values are an ordered pipeline), a filter. Often the key to *open vs closed* |
| **priority / severity** | `priority`, `severity`, `urgency`, `tier`, `level` | An **ordered** category: keep its order, do not sort it alphabetically |
| **category / type** | `category`, `subcategory`, `type`, `kind`, `class`, `segment`, `group`, `family`, `plan`, `brand`, `department`, `team`, `channel`, `source`, `medium`, `campaign`, `reason`, `method`, `device`, `carrier`, `warehouse`, `job_title`, `employment_type` | The split of a bar, row, pie or stacked chart, or a filter. Its **cardinality** (section 3) decides which |
| **country** | `country`, `country_code`, `nation`, `ship_country`, `iso2`, `iso3` | A **map** (region) or a ranking; a two-letter code is as good as a name for a map |
| **region / state / province** | `region`, `state`, `province`, `territory`, `area`, `county` | A coarser geography; a filter, or the grain when countries are too many to read |
| **city** | `city`, `town`, `ship_city` | A list to pick from, a top N, or a **pin** map when it has coordinates; too many values for an axis |
| **lat / lon** | `lat`, `latitude`, `lng`, `lon`, `long`, `longitude` | Always a **pair**. Together they make a pin map. One without the other is nothing |
| **person name** | `name`, `first_name`, `last_name`, `full_name`, `contact_name`, `customer_name`, `employee_name` | A label in a list or a "pick one" filter. **Never a grouping axis** over many people, and personal when it names a private individual |
| **free text** | `description`, `notes`, `comment`, `comments`, `message`, `body`, `subject`, `title` (of a ticket or a post), `remarks`, `summary`, `address` | **Ignored** by dashboards. Only a count of "has a comment", or a word count, can be charted. Long text (`varchar` over about 200, `text`, `clob`) is free text whatever its name |

---

## 2 · Sensitive columns: never charted, never grouped by, never listed

A dashboard is shown to people who may not be allowed to see a column's values. I leave out these columns, **say that I am leaving them out, and say why** ("the table has a `card_number`; I won't put it on any dashboard"):

- **Secrets:** `password`, `passwd`, `pwd`, `hash`, `salt`, `token`, `secret`, `api_key`, `access_key`, `private_key`, `session_id` (when it is a login session), `otp`, `pin`.
- **Payment and identity numbers:** `card_number`, `cc_number`, `pan`, `cvv`, `iban`, `account_number`, `routing_number`, `ssn`, `national_id`, `tax_id`, `passport`, `driver_license`, `nin`.
- **Contact details of a person:** `email`, `phone`, `mobile`, `fax`, `home_phone`, a street `address`.
- **Birth date** and anything that gives age or health.
- **One person's pay:** `salary`, `base_salary`, `wage`, `bonus` *per named person*. Pay is fine **in aggregate** (a department's cost, a median by level) and never as one row per named employee, unless the user states the audience is allowed to see it.

What I can still do with them: **count** them (customers with an email), report their **NULL rate**, or group them into non-identifying bands (age bands, salary bands over groups big enough that no one is identifiable). If a user insists on one of these in a list, I say it is their call, name the risk, and note that the dashboard can be locked per viewer.

## 3 · Cardinality: how many distinct values decide how a category is used

| Distinct values | It is | I use it as |
|---|---|---|
| up to about **5** | a small category | pie or doughnut, stacked area, a radio filter |
| up to about **12** | a medium category | bar or row chart, a select or multiselect filter |
| up to about **30** | a large category | row chart (sorted), or top N plus "Other"; a multiselect with search |
| up to about **1,000** | a **list to pick from** | a filter with options (a select with search); in a chart only as a **top N**, never as an axis |
| above about 1,000, or nearly one per row | an **identifier** or free text | never an axis, never a filter's option list; it is for counting (`COUNT(DISTINCT …)`) or for a table's detail column |

When I cannot profile, I estimate from the name (a `country` has under 250 values; a `customer_name` has thousands) and say it is an estimate.

## 4 · Columns a dashboard ignores

Left alone, and not worth a sentence unless the user asks: **birth dates**, **zip and postal codes** (unless the user wants a postal-area map, which needs data I do not have), **URLs** and **file paths**, **descriptions**, **comments**, **free-text titles**, **photo and blob columns**, **row hashes**, **ETL bookkeeping** (`loaded_at`, `batch_id`), **updated-at and deleted-at**, and **self-referencing keys with no use** (a `manager_id` is worth an org chart, rarely a chart).

## 5 · A short worked reading

An `orders` table with `order_id`, `customer_id`, `order_ts`, `channel`, `status`, `country_code`, `subtotal`, `discount_amount`, `shipping_fee`, `total_amount`, `warehouse_id`, `carrier`, `shipped_ts`, `promised_date`, `delivered_ts`:

- `order_id` is the **id**; `customer_id` and `warehouse_id` are **references** (inferred from the names); `order_ts` is the **event date**.
- `total_amount`, `subtotal`, `shipping_fee`, `discount_amount` are **money**; `total_amount` is the figure to sum for revenue, and `discount_amount` over `subtotal` is a **rate** I would recompute, not average.
- `channel`, `status`, `carrier`, `country_code` are **categories** (a handful, about 4, a handful, about 18) and a **country** for a map.
- `shipped_ts`, `delivered_ts` are **closed-at** values and `promised_date` is a **due-at**: so *on-time delivery* is `delivered_ts` compared with `promised_date`, and *days to deliver* is `delivered_ts` minus `order_ts`.
- Nothing here is sensitive, and nothing is free text.

That reading makes `orders` a **transactions** table with a **fulfilment** side, and `data-kinds.md` takes it from there.

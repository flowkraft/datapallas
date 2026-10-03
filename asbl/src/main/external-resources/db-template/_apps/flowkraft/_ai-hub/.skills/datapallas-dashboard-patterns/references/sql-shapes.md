# SQL shapes for the hard metrics

When a card needs more than a sum and a group-by, the SQL has a well-known shape. These are the shapes, written in **ANSI SQL wherever ANSI can do the job**, with table and column names to replace (`<angle brackets>`) and every vendor-specific part marked `-- vendor:`.

How I use them:
- I **adapt** a shape to the user's tables; I do not paste it. I name the columns I bound it to.
- **Confirm the database vendor first** (`sql-queries-plain-english-queries-expert`). The vendor-specific parts are small and listed in section 0.
- **"Today."** On a real database I use `CURRENT_DATE`. The shipped demos read `dash_demo.as_of` instead (`SELECT as_of FROM dash_demo.as_of`), because their data is frozen at one day and "last 30 days" must mean the last 30 days *of the data*. When the user's data stops before today, I suggest the same trick: a one-row "as of" value (`SELECT MAX(<event date>)`) in place of `CURRENT_DATE`.
- **Parameters.** In a Canvas SQL widget a `${name}` is a **bound** parameter, never pasted into the text. A filter that is off is written so that an empty value matches everything (`AND (${country} IS NULL OR c.country = ${country})`).
- **Exclude what is not a sale**: cancelled and test rows (`status <> 'cancelled'`), and say that I did.

---

## 0 · The few places ANSI does not reach (the same everywhere below)

| Need | PostgreSQL, DuckDB | MySQL, MariaDB | SQL Server | Oracle | SQLite |
|---|---|---|---|---|---|
| Days between two dates (`later - earlier`) | `later - earlier` | `DATEDIFF(later, earlier)` | `DATEDIFF(day, earlier, later)` | `later - earlier` | `CAST(julianday(later) - julianday(earlier) AS INTEGER)` |
| First day of the month of `d` | `date_trunc('month', d)` | `DATE_FORMAT(d, '%Y-%m-01')` | `DATEFROMPARTS(YEAR(d), MONTH(d), 1)` | `TRUNC(d, 'MM')` | `date(d, 'start of month')` |
| First *n* rows | `LIMIT n` or `FETCH FIRST n ROWS ONLY` | `LIMIT n` | `TOP n` or `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` | `FETCH FIRST n ROWS ONLY` (12c+) | `LIMIT n` |
| A date column stored as epoch milliseconds (SQLite sample data, legacy schemas) | – | – | – | – | `date(<col> / 1000, 'unixepoch')` |

Everything else below is ANSI: `CASE`, `COALESCE`, `NULLIF`, `EXTRACT`, `CAST`, `JOIN`, `WITH`, and window functions (`OVER`; MySQL 8+, MariaDB 10.2+, SQLite 3.25+). A boolean column is `CASE WHEN flag THEN 1 ELSE 0 END` where there is a boolean type, and `CASE WHEN flag = 1 …` where it is a 0/1 integer or text `Y/N` (`= 'Y'`).

---

## 1 · Aging buckets (receivables: how old is what we are owed)

Needs: an invoice's **due date**, its **amount**, and what has been **paid** (a paid-date column, or a payments table).

```sql
SELECT bucket, COUNT(*) AS invoices, SUM(open_amount) AS open_amount
FROM (
  SELECT i.invoice_id,
         i.amount - COALESCE(p.paid, 0) AS open_amount,
         CASE
           WHEN i.due_date >= CURRENT_DATE                 THEN '1. Current'
           WHEN CURRENT_DATE - i.due_date <= 30            THEN '2. 1-30 days'   -- vendor: days between
           WHEN CURRENT_DATE - i.due_date <= 60            THEN '3. 31-60 days'
           WHEN CURRENT_DATE - i.due_date <= 90            THEN '4. 61-90 days'
           ELSE                                                 '5. 90+ days'
         END AS bucket
  FROM <invoices> i
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM <payments> GROUP BY invoice_id) p
         ON p.invoice_id = i.invoice_id
  WHERE i.amount - COALESCE(p.paid, 0) > 0
) open_invoices
GROUP BY bucket
ORDER BY bucket;
```

The numbers in the bucket names keep the order; the chart shows them without. With no payments table but a paid date, "open" is `paid_date IS NULL`, and `open_amount` is `amount`. For the customer list, group by customer and add `MAX(days overdue)`; for **aging by segment**, join the customer's segment and group by bucket and segment.

## 2 · DSO, days sales outstanding (is collection getting slower)

DSO = **receivables at the end of the period ÷ credit sales in the period × days in the period**. Smooth it over a trailing 90 days so one big invoice does not move it.

```sql
SELECT m.month_end,
       ROUND(
         CAST(SUM(CASE WHEN i.issue_date <= m.month_end
                        AND (i.paid_date IS NULL OR i.paid_date > m.month_end)
                       THEN i.amount ELSE 0 END) AS DECIMAL(18,2))
         / NULLIF(SUM(CASE WHEN i.issue_date >  m.month_end - 90   -- vendor: date minus days
                            AND i.issue_date <= m.month_end
                           THEN i.amount ELSE 0 END), 0) * 90, 1) AS dso_days
FROM <month_ends> m            -- one row per month end, e.g. SELECT DISTINCT <period> FROM <a monthly table>
CROSS JOIN <invoices> i
GROUP BY m.month_end
ORDER BY m.month_end;
```

Notes: receivables *at a past date* need the paid date (or the payments' dates), so a table that only carries a current status cannot give a DSO history; I say so and offer today's DSO only.

## 3 · MRR movement (what moved recurring revenue: new, expansion, contraction, churn)

With a **changes table** (`change_date`, `change_type`, `mrr_delta`) this is a plain sum:

```sql
SELECT change_type, SUM(mrr_delta) AS mrr_change
FROM <subscription_changes>
WHERE change_date >= <start of the 12 months> AND change_date < <first day after the last month>
GROUP BY change_type;
```

Without one, derive it from the subscriptions' two dates:

```sql
SELECT 'new'   AS change_type,  SUM(mrr)  AS mrr_change FROM <subscriptions>
 WHERE start_date  >= <from> AND start_date  < <to>
UNION ALL
SELECT 'churn' AS change_type, -SUM(mrr)  AS mrr_change FROM <subscriptions>
 WHERE cancel_date >= <from> AND cancel_date < <to>;
```

Expansion and contraction need the *amount changing* on a subscription, so a table that stores only the current MRR cannot show them; I name that as missing. **MRR at a month end** = the sum of `mrr` where `start_date <= month_end` and (`cancel_date IS NULL` or `cancel_date > month_end`). **Churn rate for a month** = subscribers cancelled in the month ÷ subscribers active at its start; it is a **higher-is-worse** gauge.

## 4 · Cohort retention (of the people who arrived in a month, how many are still active N months later)

Needs a **signup date** per customer and an **activity** table with a date and the customer (orders, logins).

```sql
SELECT cohort,
       age_months,
       COUNT(DISTINCT customer_id) AS active_customers
FROM (
  SELECT c.customer_id,
         EXTRACT(YEAR FROM c.signup_date) * 100 + EXTRACT(MONTH FROM c.signup_date) AS cohort,   -- e.g. 202503
         (EXTRACT(YEAR FROM o.order_date)  - EXTRACT(YEAR FROM c.signup_date)) * 12
       + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date))   AS age_months
  FROM <customers> c
  JOIN <orders> o ON o.customer_id = c.customer_id
) activity
WHERE age_months >= 0
GROUP BY cohort, age_months
ORDER BY cohort, age_months;
```

Divide each cell by the cohort's size (`COUNT(*)` of customers per cohort) to get **%**, and show it as a heatmap pivot, one row per cohort, one column per age. **Grain:** monthly cohorts while a cohort holds roughly 100 or more people; below that use **quarterly** cohorts (age in quarters) so one customer does not move a cell by several points. Do not show cells whose age has not been reached yet (the last diagonal) as zero: leave them empty.

## 5 · Funnel (where visitors drop)

Needs boolean steps in order (or stage timestamps): reached product, cart, checkout, purchased.

```sql
SELECT 'Session'  AS step, COUNT(*) AS sessions FROM <sessions>
UNION ALL SELECT 'Product',  SUM(CASE WHEN reached_product  THEN 1 ELSE 0 END) FROM <sessions>
UNION ALL SELECT 'Cart',     SUM(CASE WHEN reached_cart     THEN 1 ELSE 0 END) FROM <sessions>
UNION ALL SELECT 'Checkout', SUM(CASE WHEN reached_checkout THEN 1 ELSE 0 END) FROM <sessions>
UNION ALL SELECT 'Purchase', SUM(CASE WHEN purchased        THEN 1 ELSE 0 END) FROM <sessions>;
```

A conversion rate is `100.0 * SUM(purchased) / NULLIF(COUNT(*), 0)`; **by traffic source** group by the source. For a pipeline of stages instead of flags, count the deals that reached **at least** each stage (a deal at "Negotiation" has also been through "Qualified"), so the funnel only narrows. If the sessions are a sample, rates are unbiased and counts are scaled by the sampling rate.

## 6 · Headcount over time

Needs **hire** and **termination** dates and a list of month ends.

```sql
SELECT m.month_end, COUNT(e.employee_id) AS headcount
FROM <month_ends> m
LEFT JOIN <employees> e
       ON e.hire_date <= m.month_end
      AND (e.termination_date IS NULL OR e.termination_date > m.month_end)
GROUP BY m.month_end
ORDER BY m.month_end;
```

`<month_ends>` can be any monthly table (`SELECT DISTINCT period_month FROM <payroll_lines>`) or a generated series. **Attrition rate** = leavers ÷ average headcount, **annualised**, over a long window (the whole history), never one year of a small team: a department of ten with one leaver is a 10% "rate" that is one person. Group departments under about 15 people into "Corporate".

## 7 · On-time %

Needs a **delivered (or closed) timestamp** and a **promised (or due) date**; late = delivered after the promise.

```sql
SELECT carrier,
       COUNT(*) AS deliveries,
       100.0 * SUM(CASE WHEN CAST(delivered_ts AS DATE) <= promised_date THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0) AS on_time_pct
FROM <orders>
WHERE delivered_ts IS NOT NULL
GROUP BY carrier;
```

**Late %** is `100 - on_time_pct`. Only delivered rows count; the ones still in transit and already past their promise are a separate "overdue" card. **By country:** show the **rate**, not the count, and return NULL for a country with fewer than about 60 deliveries (`CASE WHEN COUNT(*) >= 60 THEN … END`) so it stays uncoloured and no small sample reads as a fact. **Average days to deliver** is the difference of two dates (section 0).

## 8 · SLA %

With a breached flag:

```sql
SELECT team,
       100.0 * SUM(CASE WHEN sla_breached THEN 0 ELSE 1 END) / NULLIF(COUNT(*), 0) AS sla_met_pct
FROM <tickets> t JOIN <agents> a ON a.agent_id = t.agent_id
WHERE t.resolved_ts IS NOT NULL
GROUP BY team;
```

With only SLA **hours** and two timestamps, the test is "resolved within `sla_hours` of opened", which needs the hour difference of two timestamps (a vendor form: `EXTRACT(EPOCH FROM resolved_ts - opened_ts) / 3600` on PostgreSQL and DuckDB; `TIMESTAMPDIFF(HOUR, opened_ts, resolved_ts)` on MySQL, MariaDB; `DATEDIFF(hour, opened_ts, resolved_ts)` on SQL Server). **Resolution time:** report the **median** and the spread (a boxplot), not the average alone, because durations skew right. **Open tickets** are those with `resolved_ts IS NULL` (or a status that is not closed).

## 9 · Year to date against the same period last year

Interval-free, so it is the same text on every vendor: compare the (month, day) pair.

```sql
SELECT
  SUM(CASE WHEN EXTRACT(YEAR FROM order_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN total ELSE 0 END) AS this_ytd,
  SUM(CASE WHEN EXTRACT(YEAR FROM order_date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            AND (EXTRACT(MONTH FROM order_date) <  EXTRACT(MONTH FROM CURRENT_DATE)
              OR (EXTRACT(MONTH FROM order_date) =  EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(DAY   FROM order_date) <= EXTRACT(DAY   FROM CURRENT_DATE)))
           THEN total ELSE 0 END) AS last_ytd
FROM <orders>
WHERE status <> 'cancelled';
```

Growth % is `100.0 * (this_ytd - last_ytd) / NULLIF(last_ytd, 0)`. It needs data from **last year**; with less than 13 months of history I do not offer it. **Per country**, fold the countries with few orders into "Other": a growth % on a few dozen orders swings by many points.

## 10 · Share of total

```sql
SELECT category,
       SUM(line_amount) AS revenue,
       100.0 * SUM(line_amount) / NULLIF(SUM(SUM(line_amount)) OVER (), 0) AS share_pct
FROM <order_lines> l JOIN <products> p ON p.product_id = l.product_id
GROUP BY category
ORDER BY revenue DESC;
```

The window `SUM(SUM(x)) OVER ()` is the grand total; it is the one-pass way to a percent of the whole. **A segment against everyone** is two columns of the same query: the segment's share and everyone's, side by side (`SUM(CASE WHEN country = ${country} THEN x ELSE 0 END)` over `SUM(x)`).

## 11 · Top N with `${topN}`

A "How many" filter (an integer select: 5, 10, 25) bound into the query:

```sql
SELECT p.name AS product, SUM(l.line_amount - l.line_cost) AS gross_margin
FROM <order_lines> l JOIN <products> p ON p.product_id = l.product_id
GROUP BY p.name
ORDER BY gross_margin DESC
LIMIT ${topN};                       -- vendor: see section 0 for the other forms
```

The **bottom N** is the same query ordered ascending. Sort by the **aggregate** (or its alias in the same query, where the vendor allows it), never by a column that is not grouped. With no top-N filter I still cap a long list (a table over 20 rows pages instead).

---

## Two habits that keep these honest

- **Say what a shape assumes.** "This assumes `paid_date` is the date the invoice was fully paid; if you record part payments we need the payments table." The assumption is part of the answer.
- **A shape is a starting point I check against the data**: a quick count, the date range, the NULL rate of the columns it leans on. If `db_query` is off, I ask the user for those three facts instead of guessing.

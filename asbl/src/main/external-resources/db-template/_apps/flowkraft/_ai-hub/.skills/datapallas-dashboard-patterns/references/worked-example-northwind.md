# Worked example: the method on the shipped Northwind sample

The user says: *"This is my database (Northwind SQLite). Which dashboards should I build?"* This is what I do and say, step by step. Northwind is small, well known and has no declared foreign keys, so it is a good schema to show the reasoning on.

The sizes below are what the shipped sample looked like when this was written: **about 80 orders over about 18 months, 20 products, 25 customers, 3 employees, 3 shippers, 8 categories**. A different copy of Northwind can be much bigger (the classic one has 830 orders and 9 employees). I check with a count before I rely on any of it, and the choices below change with the size where I say so.

---

## 1 · Look

I open `config/connections/<code>/<code>-table-names.txt` and see: `Categories`, `CustomerCustomerDemo`, `CustomerDemographics`, `Customers`, `EmployeeTerritories`, `Employees`, `Order Details`, `Orders`, `Products`, `Region`, `Shippers`, `Suppliers`, `Territories`.

Then I `grep` the information-schema file for the tables I care about. There are **no declared foreign keys**, so I build the reference graph from the names and say so:

| Reference (inferred) | Points to | How I know |
|---|---|---|
| `Orders.CustomerID` | `Customers.CustomerID` | same name |
| `Orders.EmployeeID` | `Employees.EmployeeID` | same name |
| `Orders.ShipVia` | `Shippers.ShipperID` | **name differs**: an integer on a table with one shippers lookup, so I read it as the carrier and ask the user to confirm (or check with a join count) |
| `Order Details.OrderID` | `Orders.OrderID` | same name |
| `Order Details.ProductID` | `Products.ProductID` | same name |
| `Products.CategoryID` | `Categories.CategoryID` | same name |
| `Products.SupplierID` | `Suppliers.SupplierID` | same name |
| `Employees.ReportsTo` | `Employees.EmployeeID` | a manager reference to the same table |

I also note: the vendor is **SQLite**, and its dates are stored as **epoch milliseconds** (integers). `OrderDate` is a `timestamp` by name but an integer by value, so every date filter and bucket goes through `date(col / 1000, 'unixepoch')`. A naive `WHERE OrderDate >= '2023-01-01'` matches nothing.

## 2 · Roles (the ones that matter)

- **`Orders`:** `OrderID` id; `CustomerID`, `EmployeeID`, `ShipVia` references; **`OrderDate` the event date**; **`RequiredDate` a due-at** and **`ShippedDate` a closed-at** (NULL while not shipped); `Freight` money; `ShipCountry`, `ShipCity`, `ShipRegion` places; `ShipName`, `ShipAddress`, `ShipPostalCode` ignored.
- **`Order Details`:** `UnitPrice` money, `Quantity` quantity, `Discount` a **rate** (0 to 1); revenue is `UnitPrice * Quantity * (1 - Discount)` per line, summed.
- **`Products`:** `ProductName` a label; `UnitPrice` money; **`UnitsInStock`, `UnitsOnOrder`, `ReorderLevel`** stock levels; `Discontinued` a flag; `CategoryID`, `SupplierID` references; `QuantityPerUnit` text, ignored.
- **`Customers`:** `CompanyName` a label; `Country`, `City`, `Region` places; **`Phone`, `Fax`, `Email`, `Address`, `ContactName` are personal or contact details, and I won't chart or list them**.
- **`Employees`:** `HireDate`; `Title`, `Country`, `City`; `ReportsTo` a manager reference; **`BirthDate`, `HomePhone`, `Mobile`, `Email`, `Address` sensitive**; `Notes` free text; `Photo` a blob; both ignored.
- **`Categories`:** `CategoryName` a label, with a `Picture` blob ignored. **`Shippers`, `Suppliers`:** lookups with a company name.
- **`CustomerCustomerDemo`, `CustomerDemographics`, `EmployeeTerritories`, `Territories`, `Region`:** link and lookup tables with nothing to count over time; I leave them out and say so.

There is **no cost column** anywhere, so there is **no margin**: that is the first thing I say is missing.

## 3 · Kinds

- **`Orders` + `Order Details` = transactions.** Header and lines: the header has the event date and the references, the lines carry the money and the product. `Orders` also carries a **fulfilment** side (`RequiredDate`, `ShippedDate`, `ShipVia`, `Freight`).
- **`Customers` = customers** (an entity pointed to by orders). It has no signup date, so **no growth or cohort dashboard**: I say what is missing ("no signup date; I could use each customer's first order date instead").
- **`Products` has `UnitsInStock` + `ReorderLevel` = inventory** (as a snapshot, no movements table, so no turnover).
- **`Employees` as `Orders.EmployeeID` = sales performance**: a person who owns transactions. With only 3 employees (or 9 in the classic) it is a small comparison, not a leaderboard.
- Lookups: `Categories`, `Suppliers`, `Shippers`.
- **Facts:** `Orders`, `Order Details`. **Entities they describe:** `Customers`, `Products`, `Employees`, `Shippers`, `Categories`, `Suppliers`.

## 4 · Dashboards, with the slots bound

Profile first, if `db_query` is on: the date range of `OrderDate` (about 18 months here: enough for a month-by-month line and a same-month-last-year read from the second year, not enough for years of seasonality); the distinct `ShipCountry` (about 10, so a map reads and a row chart reads); the distinct `CategoryID` (8, a bar chart); and the NULL rate of `ShippedDate` (open orders: about a third).

### 1 · Sales Overview — the head of sales, Monday morning
*Decision: is sales on its growth path, and which categories, countries and products carry it.* Transactions, DD02's shape.
- Row 1, KPIs: revenue (sum of line amounts), orders (`COUNT(DISTINCT OrderID)`), average order value, customers who ordered (`COUNT(DISTINCT CustomerID)`).
- Row 2, the trend: revenue per month, full width.
- Row 3, why: revenue by category (lines → products → categories, so SQL, not one table); revenue by country.
- Row 4, where and who: a map by `ShipCountry`; top 10 products by revenue.
- Filters: date range (default: the data's last 12 months), country, category.
- *Missing:* channel (no such column), cost.
- *See it live:* **DD02**.

### 2 · Product Performance — the category manager
*Decision: which products to push, fix or delist.* Transactions by product, DD05's shape.
- Units sold against price (scatter); top N and bottom N by revenue (**revenue**, not margin: no cost); the full product list with the stock beside it.
- Filters: category, how many (5 / 10 / 25).
- *Missing:* rating, return rate, cost; so no "rating against sales" and no margin card.
- *See it live:* **DD05**.

### 3 · Inventory — the purchasing manager, daily
*Decision: what to reorder today, and what is tied up.* DD19's shape, on one warehouse.
- KPIs: stock value (`UnitsInStock * UnitPrice`: the **sale price**, since there is no cost, and the card says so), products at or below `ReorderLevel`, products on order.
- A bar of units in stock against reorder level for the products at or below it; the list to act on: `ProductName`, `UnitsInStock`, `ReorderLevel`, `UnitsOnOrder`, supplier, "below reorder" on by default.
- Filters: category, supplier, below reorder only.
- *Missing:* warehouses and capacity (a single stock figure), last sold date and so slow movers, movements.
- *See it live:* **DD19**.

### 4 · Fulfillment — the logistics manager
*Decision: are we shipping on time, and is it one shipper.* DD20's shape.
- Gauge: on-time % (`ShippedDate` on or before `RequiredDate`, shipped orders only); numbers: late orders, average days from order to ship; late % by shipper; a map of late % by `ShipCountry` (**a country with fewer than about 10 shipped orders in this small sample shows no rate**); the list of late and open-and-overdue orders.
- Filters: shipper, date range.
- *Honest caveat:* with about 50 shipped orders and one or two late, a rate by shipper is **anecdote, not a finding**. I say so; on a bigger copy it becomes useful.
- *See it live:* **DD20**.

### 5 · Sales by Employee — the sales manager
*Decision: who sells what, and is the workload even.* Transactions by owner.
- Revenue and orders per employee (bar); revenue per employee per month (line, one series each, only with few employees); each employee's top category.
- Filter: date range.
- Employees are shown by **name** (or title), never by id; their **pay and birth dates are never on the page.**
- *Missing:* quotas or targets (no table), so nothing against plan.
- *See it live:* nearest are **DD02** and **DD08** (against a target, if a quota table existed).

## 5 · Layout

For each: the reading order of `layout-and-widgets.md`: title with the finding, KPI row, the trend, the breakdowns, the map and the top N, the list last. A 4-widget KPI row, one full-width line, two side-by-side breakdowns, a map beside a list. Under 14 widgets, under 4 filters, each filter with a default relative to the data's own last date (the sample ends in 2024, not today).

## 6 · Answer (the shape of what I say)

1. The five dashboards above, ranked, each with person, decision, tables and columns, widgets and filters.
2. **What the data cannot give:** margin (no cost), customer growth and cohorts (no signup date), channel (no channel column), warehouses (one stock figure), quotas, ratings and returns.
3. **What I inferred from names:** all eight references above; `ShipVia` was the loosest.
4. **What I left out on purpose:** the contact details and birth dates (sensitive), the notes, photos and pictures, and the territory and demographic link tables.
5. **Live demos:** DD02, DD05, DD19, DD20 (and DD08 for the targets idea), in Samples → 23. Dashboard Demos, each with its "how it was built" page.
6. **Offer the next dashboards:** a customer-by-country zoom-in (DD03's shape), a customer's own record (DD11's shape) and each category against everyone (DD25's shape); and offer a PRD, or a hand-off to `datapallas-dashboards` for the Canvas.

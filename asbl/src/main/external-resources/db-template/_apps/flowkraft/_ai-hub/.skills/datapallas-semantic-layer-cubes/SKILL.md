# Semantic Layer (Cubes) Skill

I help users design, create, and use **Cubes** — the DataPallas semantic layer. A cube turns raw database tables into business-named dimensions and measures, with joins pre-wired, so every report, dashboard, AI question, and embedded widget reads from the same definition of truth.

> **The full official guide is at https://datapallas.com/docs/semantic-layer.** This SKILL.md captures the essence; for keyword-level detail, edge cases, and the latest features, fetch the docs.

---

## The Mental Model

A Cube sits **between** the raw database and everything that consumes data:

```
                ┌────────────────────────────────────────────────┐
                │  Consumers                                     │
                │  • Explore Data Canvas (drop a cube → widget)  │
                │  • Dashboards & reports (cube as data source)  │
                │  • AI chat / Athena (cubes as grammar)         │
                │  • Embedded cube preview (`<rb-cube-renderer>`)│
                │  • Copy-paste Generated SQL into anywhere      │
                └────────────────────────────────────────────────┘
                                     ▲
                                     │  ticks fields → cube emits SQL
                                     │
                ┌────────────────────────────────────────────────┐
                │  Cube                                          │
                │  • Dimensions (slice-by columns, business      │
                │    names: "Order Status", not "os_cd")         │
                │  • Measures (aggregations: count, sum, avg)    │
                │  • Joins (orders → customers wired)            │
                │  • Segments (reusable named filters)           │
                │  • Hierarchies (country → region → city)       │
                └────────────────────────────────────────────────┘
                                     ▲
                                     │  reads tables via the connection
                                     │
                ┌────────────────────────────────────────────────┐
                │  Database connection (credentials, schema)     │
                └────────────────────────────────────────────────┘
```

The cube owns *what the metrics mean*. Connections own credentials. Reports own formatting. Cubes turn business meaning into SQL on demand for everything downstream.

---

## Where Cubes Live in the UI

Top menu → **Configuration** → **Reports, Connections & Cubes** → left menu → **Cubes / Semantic Layer**.

Five Northwind sample cubes ship bundled — each shown in the list with a **sample** badge. They sit on the **Northwind SQLite sample database** that ships with DataPallas (no Docker, no external setup). **Sample cubes are read-only**; to change one, click **Duplicate** to create an editable copy (it lands in `config/cubes/`):

| Sample cube                   | On-disk folder                                |
| ----------------------------- | --------------------------------------------- |
| Northwind Customer Management | `/datapallas/config/samples-cubes/northwind-customers/` |
| Northwind Human Resources     | `/datapallas/config/samples-cubes/northwind-hr/`        |
| Northwind Product Inventory   | `/datapallas/config/samples-cubes/northwind-inventory/` |
| Northwind Sales Analysis      | `/datapallas/config/samples-cubes/northwind-sales/`     |
| Northwind Sales Warehouse     | `/datapallas/config/samples-cubes/northwind-warehouse/` |

Each folder contains two files:

- `cube.xml` — cube metadata (name, title, description, database connection reference, capabilities)
- `<cube-name>-cube-config.groovy` — the actual Cube DSL (dimensions, measures, joins, segments, hierarchies)

These are great starting points: open one in the UI, OR read the `*-cube-config.groovy` directly on disk to study the DSL, then adapt the pattern to your own database.

**Where your own cubes are saved:** cubes the user creates land in `/datapallas/config/cubes/<cube-id>/` — the same two files (`cube.xml` + `<cube-id>-cube-config.groovy`). DataPallas resolves cubes from `config/cubes/` first (user-owned), then falls back to the read-only `config/samples-cubes/`. I read either the same way.

---

## Anatomy of a Cube (Cube DSL — Groovy)

```groovy
cube {
  sql_table 'orders'
  title 'Orders'
  description 'Customer orders with revenue analysis'

  // Dimensions — what you slice/filter by
  dimension { name 'order_id';     title 'Order ID';     sql 'OrderID';      type 'number'; primary_key true }
  dimension { name 'order_date';   title 'Order Date';   sql 'OrderDate';    type 'time' }
  dimension { name 'ship_country'; title 'Ship Country'; sql 'ShipCountry';  type 'string' }
  dimension { name 'ship_city';    title 'Ship City';    sql 'ShipCity';     type 'string' }

  // Measures — aggregations
  measure { name 'order_count';   title 'Order Count';     type 'count' }
  measure { name 'avg_freight';   title 'Average Freight'; sql 'Freight'; type 'avg'; format 'currency' }
  measure { name 'total_freight'; title 'Total Freight';   sql 'Freight'; type 'sum'; format 'currency' }
}
```

Five building blocks (full keyword reference at `/docs/semantic-layer/dsl-reference`):

| Block        | Purpose                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `dimension`  | A column users slice/group/filter by. Always has `name`, `title`, `sql`, `type`.                 |
| `measure`    | An aggregation. Types: `count`, `sum`, `avg`, `min`, `max`, `count_distinct`. Optional `format`. |
| `join`       | Wire up a related table (e.g. orders → customers). Defines the relationship type and condition.  |
| `segment`    | A reusable named filter ("active customers", "last 30 days").                                    |
| `hierarchy`  | Drill-down path (country → region → city) used by Canvas widgets and the AI.                     |

The DSL is Groovy — but I never expect users to write it from scratch.

---

## How Users Actually Build Cubes (Three Easy Paths)

When a user creates a new cube (the **Create Cube** button), they fill its **Name**, **Description**, and **Database Connection** — this becomes the `cube.xml` metadata — then populate the DSL body one of three ways:

1. **Click `Hey AI, Help Me…`** — describes what they want in plain English; the AI drafts the cube against the live schema. This is what most users do.
2. **Open the `Example (Cube Options)` tab** — fully-annotated copyable example.
3. **Paste a starter from the docs** and tweak it.

A **preview pane** (toggle **Show/Hide preview**) renders the cube live via `<rb-cube-renderer>` against the real database; DSL errors surface right there, so fixing the definition re-validates instantly.

**Show SQL** opens a **Generated SQL** modal with exactly the query the cube produced for the current selection — invaluable for debugging and for handing off to a DBA.

---

## The Everyday Workflow (the 90% Use Case)

Most cube usage is *not* about complicated semantic-layer architecture. It's about getting good SQL fast:

1. Open a cube that matches what the user is looking for
2. Tick a few dimensions, measures, filters
3. Click **Show SQL**
4. Copy-paste that SQL into a report's data source, a script, a SQL editor — anywhere

That's the killer feature even seasoned developers reach for: faster than typing the SQL by hand, and it never gets the joins or `GROUP BY` wrong.

---

## When to Reach for a Cube vs. Skip It

**Reach for a cube when:**
- Writing a new report and need correct SQL fast (the everyday case)
- The user knows the business but not the schema (`t_ord_hdr_v2` means nothing)
- The same metric appears in multiple places (report + dashboard + AI question) — define once, consume everywhere
- Non-technical users will be asking questions through AI chat or Canvas widgets
- Discovering what data is available — cubes are a much friendlier on-ramp than 200 cryptic table names

**Skip the cube when:**
- The exact SQL is already known and trusted
- It's a one-off ad-hoc lookup nobody will run again
- The data source is already shaped exactly right (no joins, no aggregations, no renames)

---

## How I Use This Knowledge

When a user asks about cubes / semantic layer / dimensions / measures / joins:

1. **First**, point at the real product: *"In the top menu open **Configuration → Reports, Connections & Cubes**, then click **Cubes / Semantic Layer** in the left menu — the five Northwind sample cubes are the best place to start. Open one and read the DSL — that's the pattern."*
2. **For new cube creation**, recommend the **Hey AI, Help Me…** path first. The AI drafts a working cube against the live schema in seconds.
3. **For deeper questions** (specific keywords, joins, segments, hierarchies, advanced types), I fetch the official docs:
   - https://datapallas.com/docs/semantic-layer — overview
   - https://datapallas.com/docs/semantic-layer/quickstart — five-minute walkthrough
   - https://datapallas.com/docs/semantic-layer/dsl-reference — every keyword
   - https://datapallas.com/docs/semantic-layer/ai — AI-drafted cubes
   - https://datapallas.com/docs/semantic-layer/embedding — embedding cube widgets
4. **Never write a cube blind.** I either start from a sample cube the user already has, or I have the user click **Hey AI, Help Me…** so the AI sees the live schema. I don't guess at column names.

---

## My Working Mode (Read-Only)

I read the docs and the bundled sample cubes (when accessible) to understand patterns. I **don't modify cube definitions directly** — I provide the DSL snippet and tell the user to paste it into the cube editor, where the live preview validates it against the real database.

When I provide a Cube DSL snippet, I:

1. Explain what the cube exposes (dimensions, measures, joins) and why
2. Give the complete DSL block to paste into the editor
3. Tell the user to toggle **Show preview** (renders via `<rb-cube-renderer>`) and click **Show SQL** to inspect the generated query
4. Mention **Hey AI, Help Me…** as the easier alternative if they'd rather describe in plain English

---

## Documentation Links

- **Overview (why & what)**: https://datapallas.com/docs/semantic-layer
- **Your First Cube (quickstart)**: https://datapallas.com/docs/semantic-layer/quickstart
- **Cube DSL Reference**: https://datapallas.com/docs/semantic-layer/dsl-reference
- **AI-Drafted Cubes**: https://datapallas.com/docs/semantic-layer/ai
- **Embedding Cube Widgets**: https://datapallas.com/docs/semantic-layer/embedding
- **DB Connections (sits below the cube)**: https://datapallas.com/docs/data-exploration/database-connections
- **Explore Data Canvas (consumes cubes)**: https://datapallas.com/docs/data-exploration/canvas
- **Dashboards (consume cubes)**: https://datapallas.com/docs/bi-analytics/dashboards

When users ask about a specific keyword, attribute, hierarchy syntax, segment definition, or join type — **I fetch the DSL Reference** and answer from the live doc, not from memory.

---

## My Principle

> **The bundled sample cubes are starting points.** Before advising on cube work, I read the relevant `*-cube-config.groovy` under `/datapallas/config/samples-cubes/` — `northwind-sales`, `northwind-customers`, `northwind-hr`, `northwind-inventory`, `northwind-warehouse`. They encode the patterns DataPallas authors expect users to follow, all built over the bundled Northwind SQLite sample database. For anything not covered by the samples, I send the user to **Hey AI, Help Me…** so the AI generates a cube grounded in their live schema, then we tweak together.

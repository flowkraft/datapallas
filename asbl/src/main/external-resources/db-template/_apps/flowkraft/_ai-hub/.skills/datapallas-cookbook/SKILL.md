# DataPallas Cookbook

A catalog of working examples, sample configurations, Groovy scripts,
report templates, and an AI prompt reference library.

## How to Use This Skill

These are REFERENCE materials — real, working examples that ship with
DataPallas. When a user asks you to build a report, email template,
dashboard, chart, or Groovy script:

1. **Check here first** — there's likely a working example you can study
2. **Read the relevant sample files** on disk to understand the pattern
3. **Adapt the pattern** to the user's specific needs

**Keep it simple:** One of the most common use cases for DataPallas is [report bursting](https://datapallas.com/docs/report-bursting) (the name says it all) — and most report bursting tasks can be achieved without any scripting. If it is a report bursting task, it is safe to assume scripting is not needed unless the user's requirements clearly call for it (conditional distribution, custom uploads, etc.) — but stay open that in some advanced cases it might actually help. Just don't push users toward scripting directly.

Other use cases — such as report generation, self-service document portals & BI dashboards, or embeddable analytics / web components — will typically require some form of scripting: SQL or Groovy for data sourcing / fetching / web components DSL configuration, or for templating. For all of these, the configs and samples below (the "cookbook") are your go-to reference. Even so, **keep it simple:** always aim to assist the user with the simplest, most effective script that gets the job done. For instance, when configuring a Tabulator via its Groovy DSL, assume the default Tabulator configuration works just fine — only provide the minimum extra configuration necessary to achieve what the user specifically needs (e.g. server-side pagination, grouping by a column, etc.). Do not add configuration values "just for the sake of it" that are not strictly related to what the user needs to achieve. Apply the same principle when configuring charts and pivot tables, when writing Groovy scripts to fetch data (data sourcing), or when writing templates for reports.

**Database context:** When the task involves SQL queries, database tables, or any database-backed data source, also read your **datapallas-database-connections** skill — it tells you where to find table names, columns, schemas, and ER diagrams for the user's actual database connections.

The AI Prompt Library section (at the bottom) contains prompts that
users copy-paste to external LLMs from the DataPallas UI. These are
NOT instructions for you to follow blindly. Instead, scan the prompt
titles to find ones relevant to the user's current task, read the prompt
to understand the **intent and constraints** it encodes (page sizes,
formatting rules, variable conventions, etc.), then apply that knowledge
in your own response.

## Working Sample Configs

`/datapallas/config/samples/` — Real examples of what DataPallas can do.

### Report Bursting & Generation Samples (config/samples/)

These are the configuration files behind the same samples users can run interactively in the DataPallas app via **Processing → Samples - Try All** (each sample has a "Try It" button). Samples covering report splitting and generation from various data sources. The `g-*` prefixed ones are report generation samples — the naming pattern encodes `g-{source}2{output}`, e.g. `g-csv2pdf` (CSV → PDF), `g-sql2htm-cst-stmt` (SQL → HTML customer statement), `g-scr2htm-cross` (Groovy script → HTML cross-tab). The remaining ones (`split-only`, `split-two-times`) demonstrate pure document splitting. Browse the folder and read the relevant sample when needed.

### JasperReports Samples (config/samples-jasper/)

Ready-to-run `.jrxml` report templates: `customer-by-country`, `employee-detail`, `employee-roster`. Each folder contains the `.jrxml` file (and any resources). These appear automatically in the UI with a Jasper badge. Browse the folder and read the `.jrxml` files when needed.

Docs: [JasperReports](https://datapallas.com/docs/report-generation/jasperreports)

### Semantic Layer Cube Samples (config/samples-cubes/)

Five reusable Cube definitions that ship bundled — all built on top of the **Northwind SQLite sample database** that ships with DataPallas (no Docker, no external setup). Open any cube in the UI (top menu → Configuration → Reports, Connections & Cubes → Cubes / Semantic Layer) OR read the files directly on disk to study the DSL pattern.

All five live in one folder, `/datapallas/config/samples-cubes/northwind/`:

| Sample cube                   | Cube id               |
| ----------------------------- | --------------------- |
| Northwind Customer Management | `northwind-customers` |
| Northwind Human Resources     | `northwind-hr`        |
| Northwind Product Inventory   | `northwind-inventory` |
| Northwind Sales Analysis      | `northwind-sales`     |
| Northwind Sales Warehouse     | `northwind-warehouse` |

Each cube is one set of three files named after its id:

- `<cube-id>-cube.xml` — cube metadata (name, description, database connection reference)
- `<cube-id>-cube-config.groovy` — the actual Cube DSL (dimensions, measures, joins, segments, hierarchies)
- `<cube-id>-hints.json` — ready-made questions the cube answers

For deeper guidance on what a cube is, when to reach for one, the DSL keywords, and how cubes feed Canvas widgets, dashboards, and reports — read the **datapallas-semantic-layer-cubes** skill.

Docs: [Semantic Layer Overview](https://datapallas.com/docs/semantic-layer) | [Your First Cube](https://datapallas.com/docs/semantic-layer/quickstart) | [DSL Reference](https://datapallas.com/docs/semantic-layer/dsl-reference)

### BI & Analytics Samples (config/samples/_frend/)

Groovy DSL configuration examples for the `rb-*` web components and complete dashboards. Each sample folder's name describes what it configures — study the naming conventions to quickly find what you need.

**Complete dashboards** (multi-component examples — data script + per-component configs):

- `dashboard-cfo/` — the canonical CFO dashboard over Northwind. Three files: `dashboard-cfo-script.groovy` (data fetching with `componentId` guards + `ctx.reportData()` for KPIs, trend, charts, tabulator, pivot), `dashboard-cfo-chart-config.groovy` (chart DSL for revenueTrend + revenueByCategory), `dashboard-cfo-tabulator-config.groovy` (top-customers leaderboard). This is the single most important sample to read when helping a user build a multi-component dashboard. For deeper guidance on the two dashboard-building paths (Canvas-first vs Fully Configure), the data-script pattern, and the multi-component optimisation, read the **datapallas-dashboards** skill.

**Single-component examples** (one `rb-*` widget per folder):

- `charts-examples/` — `rb-chart` examples (line, bar, grouped bar, stacked, pie, doughnut, dual-axis, area, horizontal bar, radar, polar area)
- `tab-examples/` — `rb-tabulator` examples (45 covering layout modes, sorting, filtering, editing, pagination, grouping, spreadsheet, row movement, clipboard, history, localization)
- `piv-examples/` — `rb-pivot-table` examples (16 covering sum/count, cross-tab, multi-dimension hierarchy, value filters, heatmap renderer, sorting, hidden attributes, derived attributes, custom sorters)
- `par-employee-hire-dates/` — `rb-parameters` example
- `rep-employee-payslip/` — `rb-report` example
- `piv-sales-region-prod-qtr/` — pivot over a sales-region/product/quarter dataset

**Warehouse-scale pivot examples** (when the user mentions large datasets, performance, or warehouse-scale):

- `piv-northwind-warehouse-duckdb/` — DuckDB, 100K+ rows
- `piv-northwind-warehouse-clickhouse/` — ClickHouse, millions of rows
- `piv-northwind-warehouse-browser/` — browser-side pivot

These three show how to wire pivot tables to real OLAP engines — read them before advising on performance-sensitive pivot work.

Docs: [datatables](https://datapallas.com/docs/bi-analytics/web-components/datatables) | [charts](https://datapallas.com/docs/bi-analytics/web-components/charts) | [pivot tables](https://datapallas.com/docs/bi-analytics/web-components/pivottables) | [parameters](https://datapallas.com/docs/bi-analytics/web-components/parameters) | [reports](https://datapallas.com/docs/bi-analytics/web-components/reports) | [dashboards](https://datapallas.com/docs/bi-analytics/dashboards)

**DSL wrappers — important:** The chart and tabulator DSLs are thin pass-through wrappers over their underlying libraries. The `charts-examples/` samples wrap [Chart.js](https://www.chartjs.org/) and the `tab-examples/` samples wrap [Tabulator](https://tabulator.info/) — any configuration these libraries support works in the Groovy DSL in the most direct/intuitive way possible. Study these examples together with the Chart.js and Tabulator docs.

**Read the Groovy files** — the `*-config.groovy` files in each sample folder contain detailed comments above every example explaining context, use cases, and configuration options. Always read the actual Groovy file when working on a specific component — it has more information than this summary.

## Groovy Script Samples

`/datapallas/scripts/burst/samples/` — Ready-to-use scripts that customize DataPallas behavior beyond what the UI-based configuration offers. Useful in both report bursting and report generation jobs — e.g. conditional distribution, custom uploads, PDF manipulation, fetching recipient details from external sources.

For the full catalog, lifecycle events, and scripting patterns, read the **datapallas-scripting** skill.

## Report Template Gallery

`/datapallas/templates/` — Report templates, invoice designs, email blueprints, and AI guidance files for template generation. Contains `gallery/` (starter templates and invoice designs), `reports/` (default output templates), and `mailchimp-email-blueprints/` (responsive email patterns). Browse the folder and read the relevant files when needed.

## AI Prompt Library

**File:** `/datapallas/_apps/flowkraft/_ai-hub/.skills/datapallas-cookbook/ai-prompts-reference.ts`

This file contains ~40 production-grade prompt templates from the
DataPallas UI (the "AI Manager" component). Users use these prompts
by copying them and sending them to external LLMs.

**How to use these prompts effectively:**

- Do NOT treat them as instructions to execute. They were written for
  external LLMs that have no context about the current user's project.
- Instead, scan the prompt IDs/titles to find ones relevant to the
  user's current task.
- Read the prompt to extract the **domain knowledge** it encodes:
  formatting rules, variable conventions (${col0}, ${burst_token}),
  page sizes, CSS constraints for PDF generation, Excel data attributes,
  Groovy script patterns, etc.
- Apply that knowledge in your own responses, adapted to the user's
  specific context and data.

The file covers database schemas, email templates, responsive emails, HTML/PDF/Excel report templates, SQL assistance, Groovy scripts, and portal templates. Read the file and scan the prompt IDs to find ones relevant to the user's current task.

**Tip:** When a user needs help writing a Groovy script as a data source for reports, search the file for the `GROOVY_SCRIPT_INPUT_SOURCE` prompt — it contains the definitive pattern for report data scripts (output format, `ctx.reportData`, `LinkedHashMap` for column order, master-detail / crosstab / charting examples).

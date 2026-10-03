# Dashboard Patterns Skill

I help users decide **which dashboards to build on their data** before they build any. A user arrives with a database and a vague wish — "we want some dashboards" — and I turn the shape of their data into a short, ranked, *intentional* list: who would use each dashboard, the decision it serves, the tables and columns it needs, its widgets top to bottom, its filters, and what the data cannot fill.

I reason, out loud, from the schema. There is no engine behind this and no hidden scoring: the method below is the whole thing, and the user can follow every step and disagree with any of them.

> The build itself is a different skill. **`datapallas-dashboards`** owns the Data Canvas, the widgets, parameters and publishing. This skill decides *what* to build; that one shows *how*. For running SQL and drawing charts in the chat, **`chat2db-jupyter-interface`**; for SQL craft, **`sql-queries-plain-english-queries-expert`**; for a PRD, **`business-analysis`**.

---

## When I use this skill

- *"This is my database — which dashboards should I build?"* · *"What can I do with this data?"* · *"Where do I even start?"*
- *"What would you put on a sales / finance / support / HR dashboard?"*
- A user connects a database and has no question yet.
- A user is about to build a dashboard and I suspect the data cannot support what they describe.

I do **not** use it to build a dashboard the user has already specified (that is `datapallas-dashboards`), or to answer one data question (that is Chat2DB).

## What I read, and when (just in time)

`references/` is opened only when the step needs it:

| File | I open it when |
|---|---|
| `column-roles.md` | giving columns a role (step 2), and for the sensitive-column and cardinality rules |
| `data-kinds.md` | giving tables a kind (step 3) and picking the dashboards and cards for each kind (step 4) |
| `layout-and-widgets.md` | laying a dashboard out (step 5): the intentional test, widget choice, grid, grain, filters |
| `sql-shapes.md` | a card needs a hard metric: aging, DSO, MRR movement, cohorts, funnel, headcount, on-time %, SLA %, year over year, share, top N |
| `live-demos.md` | pointing at the finished dashboard that matches (step 6). It is generated from the product's own demo list; I never edit it |
| `worked-example-northwind.md` | the user's database is Northwind, or I want to show the method on a small known schema |

---

## The method

I do these in order and say what I am doing as I go. The user learns the method by watching it.

### 1 · Look

- I read the connection's table list first: `/datapallas/config/connections/<code>/<code>-table-names.txt`.
- Then I `grep` `<code>-information-schema.json` for each candidate table's columns and `foreignKeys`. I never read a file over 500 KB whole (the `chat2db-jupyter-interface` rule), and I do not rely on `SHOW TABLES` or `LIST CONNECTIONS`, which the Chat2DB engine does not special-case.
- When they exist I also use `<code>-domain-grouped-schema.json` and `<code>-ubiquitous-language.md`: the business's own words are worth more than my guesses.
- **Most schemas declare no foreign keys.** The ones DataPallas ships do not, and a lot of real ones are the same. So I build the **reference graph** myself: declared `foreignKeys` first, then every column named `<name>_id` (or `<Name>ID`) whose name matches another table's key is read as a reference to that table. **I say which references I inferred from a name**, so the user can correct one.
- The vendor matters for the SQL I propose (SQLite stores dates as epoch milliseconds, for one). I confirm it the way `sql-queries-plain-english-queries-expert` says.

### 2 · Give every column a role

From its name and type — `column-roles.md` has the list: an id, a reference, a created-at, a money amount, a quantity, a rate, a status, a category, a country, a place, a person, free text. A column can have no useful role, and that is fine: dashboards ignore many columns.

Two rules apply here before anything else:
- **Sensitive columns are never charted, grouped by or listed** — a password, a token, a card or national number, an email, a phone, a birth date, one person's salary. I name them and say why I am leaving them out.
- **Cardinality decides how a category is used.** Up to about 30 distinct values it fits a bar or a row chart; up to about 1,000 it is a list to pick from (a filter with options), never an axis; above that it is an identifier or free text.

### 3 · Give every table a kind

From its roles and its place in the reference graph — `data-kinds.md`. **Facts point to many tables; entities are pointed to.** I say which tables are facts and which are the entities they describe, and I name the kind in plain words: *"`Orders` and `Order Details` are transactions; `Customers` are customers."*

### 4 · Pick dashboards for the kinds, and bind their slots

Each kind in `data-kinds.md` comes with the dashboards that suit it and the **full list of cards** they can hold. A card is a set of named **slots** — "the date the thing happened", "a money column", "a category with at most 30 values". I bind each slot to a real column, and **a card whose slot the data cannot fill is dropped**, with the reason said out loud: *"no cost column, so no margin."*

Then the part that matters most — **I keep only intentional cards.**
- For each dashboard I name **the person** and **the decision** they take with it again and again.
- A card stays only if it answers part of that decision, with one line on why.
- The other cards the data supports go in an **"also possible"** list, each with the question it would answer. I never pad a page.

**I profile where I can.** If `db_query` is on, I run short queries for what names cannot tell me: the distinct values of a candidate category (against the 30 and 1,000 limits), the date range (is there enough for year over year, and which grain?), and the NULL rate of the columns a card leans on. `db_query` is off by default. Without it I ask the user a short question — *"about how many products do you have?"* — or I work from the schema and say that I did.

### 5 · Lay each one out

In the order of the question: **the headline, the trend, the why, the where and who, the list to act on** — `layout-and-widgets.md`. It is a checklist, not a template: a step the decision does not need is skipped. At most about 14 widgets and 4 filters, every filter with a meaningful default, and one finding as the title.

### 6 · Answer

3–6 dashboards, **ranked by value to the business**. For each:
- who uses it and the decision it serves;
- the tables and columns it uses (and any reference I inferred);
- its widgets top to bottom, one line each on why it is there;
- its filters, with their defaults;
- what is missing.

Then:
- **Point at the live demo** that matches: *"see DD14 in Samples → 23. Dashboard Demos, and how it was built: <link>"* — the links are in `live-demos.md`.
- **Offer the next dashboards**, one line each, for the user to pick: **zoom-ins** (the same data by country, by channel, by product, over time), **related dashboards** (the entities the facts point to), and **comparisons** (a segment against everyone, this year against last).
- **Offer to write the PRD** (`business-analysis`), or to hand the build to **`datapallas-dashboards`** for the Canvas steps.

---

## What I say, and what I don't

- I **recommend with reasons**: every card and every drop has a sentence behind it. "Because the pattern says so" is not a reason.
- I say **what I inferred and what I know**: a reference read from a name, a role guessed from a column name, a kind decided from three columns.
- I say **what is missing** and what would unlock it. A dashboard the data half-supports is offered as that, with the missing half named.
- I never invent numbers. I see the schema, not the rows; a profiling query is run by the engine and shown to the user, so I ask them to paste a result back if I must read into it.
- I never chart a sensitive column, and I never suggest a card because it would look impressive.
- I do not build automatically and I do not promise a dashboard "generates itself": the user (or I, with them) builds each one in the Canvas.
- It is **our** project, never "your" DataPallas.

## Hand-offs

| When | To |
|---|---|
| The user picked a dashboard and wants to build it | `datapallas-dashboards` (Canvas flow, parameters, publishing) |
| The user wants reusable measures and joins behind the widgets | `datapallas-semantic-layer-cubes` |
| The data is not in a shape any dashboard can use (no dates, no keys) | `data-modelling` |
| The user wants requirements written down first | `business-analysis` (a PRD) |
| One question, not a dashboard | `datapallas-data-exploration` (Chat2DB) |
| The user wants a table's content understood before deciding | the **Table Profile** demo (DD23), or profiling queries when `db_query` is on |

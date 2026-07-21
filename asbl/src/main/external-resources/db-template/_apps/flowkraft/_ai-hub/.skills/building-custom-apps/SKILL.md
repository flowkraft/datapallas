# Building Custom Apps Skill

This is my **production build path** for a custom **data app** on DataPallas — an admin / self-service
portal, or a backend automation — for **whatever domain the user is in**: billing, HR, CRM, inventory,
support, anything. The pattern never changes; only the data model and the features do.

> **I don't rebuild from scratch, and I don't clone the billing portal. I build the user's OWN app by
> following a proven pattern — with the shipped Billing Portal as my worked reference.**

DataPallas ships a complete, working **Billing Portal** as a custom-app example in three stacks (Grails,
Next.js, and a backend cron). It is the best reference I have for *how every piece fits together* — but
it is an **example**, not the deliverable. The deliverable is a **new app the user owns**, e.g.
`my-own-hr-portal-grails` (+ `my-own-hr-portal-bkend`), `my-own-crm-next`, or their own
`my-own-billing-portal-grails`. A billing portal is just *one* instance of the pattern, not its definition.

---

## Two ways a build starts (both work)

- **Direct from the user** — for a well-trodden ask ("a billing portal like the video, but for my
  invoices" / "a CRM with contacts and deals"), the user comes straight to me with requirements.
- **From Athena's PRD** — for a genuinely novel or complex domain, **Athena** gathers the requirements
  and writes the app PRD, then hands me the spec.

*In theory* Athena always writes the PRD first; *in practice*, for a well-trodden portal the user comes
straight to me and we go direct. Either input — a sentence or a full PRD — is enough; my job is the
same: turn requirements into a runnable `_custom/` bundle.

---

## The `_custom` convention (what a custom app IS)

A custom app is a folder under `_apps/flowkraft/xx-custom/` that contains a `_custom/` subfolder with
exactly these four things:

```
_apps/flowkraft/xx-custom/<app-id>/_custom/
  app.json          ← manifest (REQUIRED) — id, name, port, launchLinks, tablePrefix, apiKey, blueprint, tags
  app-seed.groovy   ← scaffolds the app + writes the DataPallas push report; shows in the Seed Data / Apps tab
  overrides/        ← ONLY the files you changed (domain model, routes, views, brand)
  README.md         ← the recipe
```

**The one hard rule:** folder name = app `id` = compose service = container name (kebab-case). That
single identity is what Start/Stop, `docker compose`, and the Apps Manager status matcher key on.

**Discovery is convention-based — no registration, no restart:** the backend scans
`_apps/flowkraft/xx-custom/*` for the user's own apps and `_apps/flowkraft/xx-custom/_examples/*` for the
shipped examples. So a user's OWN app is a direct child of `xx-custom/` (e.g.
`_apps/flowkraft/xx-custom/my-own-crm-grails/`); the examples sit one level deeper, in `_examples/`.

---

## The reference examples — I read these FIRST, then adapt

| Stack | Example (READ it, don't clone it) | Blueprint it scaffolds from |
|---|---|---|
| **Grails** (GSP + GORM + daisyUI 5 / Tailwind 4) | `…/_examples/billing-portal-grails/_custom/` | `flowkraft/grails-playground` |
| **Next.js** (App Router + Drizzle + daisyUI 5 / Tailwind 4) | `…/_examples/billing-portal-next/_custom/` | `flowkraft/next-playground` |
| **Backend** (Spring Boot + Groovy cron) | `…/_examples/billing-portal-bkend/_custom/` | `flowkraft/bkend-boot-groovy-playground` |

The example ships **the same billing portal built twice** — once in Grails, once in Next — with mirrored
functionality, UI, important DOM elements and semantic ids, so a **single E2E suite validates both**. (That
101%-mirror parity exists to prove the shipped example works — it is NOT a rule for the user's own app.)
Alongside sits a **backend cron specific to that portal** (the overdue-marker). Together they model a
*complete* custom data app: a frontend (Grails **or** Next — the user picks one) plus, normally, its own
**app-specific backend** for scheduled work — a *pair*, `my-own-<domain>-<stack>` + `my-own-<domain>-bkend`.
I read the example's `README.md` and files first, then **adapt** them to the user's domain — it is a
*billing* portal; the user's HR / CRM / inventory app keeps the **convention** and swaps the **domain**.

---

## The app's database — SQLite by default; ask before production

The three examples **exclusively use SQLite** for the app's own data (Grails GORM → a SQLite file;
Next Drizzle → better-sqlite3) — zero setup, ideal for a demo. So for the user's app I **ask first**:

- **Demo / proof-of-concept** → keep SQLite. Nothing to configure; it just runs.
- **Real app on an enterprise database** (Oracle, SQL Server, PostgreSQL, MySQL…) → the app's own
  datasource MUST be reconfigured for that engine — Grails: the GORM JDBC URL + driver + Hibernate
  dialect; Next: swap the Drizzle driver (e.g. `postgres` / `mysql2`) + connection string — set in
  `overrides/` and flagged in the README so it points at the real database, not a throwaway file.

This is the app's OWN persistence, separate from the DataPallas **source** connection a Burst reads
from (that is already a real DataPallas connection of any supported vendor).

---

## How it runs (one Seed-Data run, then a Burst)

The `app-seed.groovy` appears in the **Seed Data / Apps** tab of any database connection. One run does
everything, and it is **idempotent — every run regenerates from a clean slate**:

1. **Clean slate** — wipe anything a prior scaffold produced (keeping only `_custom/`, runtime data, and
   dependency caches), so the run is truly repeatable and a copied example can't run under its old id.
2. **Scaffold** — copy the blueprint into the app folder; rename the compose service/container/volumes to
   the app id; parameterize the port.
3. **Strip** — delete the blueprint's sample feature code so the copy is a clean base. *(This is the
   automated version of the old manual "Cleaning Session" — there is none.)*
4. **Apply overrides** — copy `_custom/overrides/**` over the app (the domain model, features, brand).
5. **Write the push report** *(only when the app is DataPallas-fed — see the next section)* — a
   `config/reports/<app-id>` report whose native `<httpcommand>` curl posts each source row to the app's
   REST ingest.
6. **Reveal** — flip `app.json` `"visible": false → true`; the card appears in Apps Manager.

Then the user **Starts** the app (Docker) and **Launches** its pages. If the app has a push report, they
go to **Processing → Generate Reports**, pick it, and **Burst** — their source rows flow over REST into
the app's own DB, which renders them. That Burst-feeds-the-app integration is the whole point of a
DataPallas app at scale — but whether the app has it is a per-app choice (next section).

### Data topology (say this clearly)

```
SOURCE DB (the user's own tables — invoices, employees, contacts, …)
   │  DataPallas Burst → per-row native <httpcommand> curl (X-Api-Key)
   ▼
POST /api/<resource>  →  APP DB (the app's own tables)
```

The billing example reads the bundled **Northwind** sample DB (Orders + Order Details for ALFKI + ANATR)
through a `ds.scriptfile` data script that nests each order's line items, and posts each invoice to
**`/api/invoices`**. A different domain reads a different source and posts to a different resource
(`/api/employees`, `/api/contacts`). The ingest is **idempotent**: upsert by a natural key, never
duplicate on re-Burst.

---

## The DataPallas push (step 5) — the whole point, but optional; ask

Step 5 — the `config/reports/<app-id>` push report whose native `<httpcommand>` curl posts each source
row to the app's REST ingest — is normally **the point**: it lets DataPallas **automate document / data
delivery at scale**, so one Burst feeds thousands of source rows into the app. For most apps I include it.

But not every app wants it, so I **ask**:

- **"Feed my app from DataPallas at scale"** → include the push report (step 5). The full
  DataPallas-integrated app.
- **"Just a standalone custom app — a simple CRM proof-of-concept, no DataPallas push"** → skip step 5
  entirely. The app still scaffolds, self-seeds its demo data on first boot, and runs on its own; the
  user enters data through the app's own UI. No report, no Burst.

---

## "Make it the user's app" — what changes per domain

Everything unchanged (build files, Dockerfile, layout shell, theme picker) comes from the blueprint at
scaffold time. What I put in `overrides/` (plus the push edit in `app-seed.groovy`) depends on how far the
user's domain is from the billing example:

- **Data model** — the domain entities (Grails GORM domains / Next Drizzle schema, prefixed per
  `tablePrefix`). Billing has invoice / customer / line; HR has employee / department; a CRM has
  contact / deal.
- **REST ingest** — the `/api/<resource>` handler that accepts the pushed payload (Grails `Api*Controller`;
  Next `app/api/<resource>/route.ts`).
- **Push query** — `app-seed.groovy`'s `writePushReport`: the `ds.scriptfile` SQL that reads the user's
  source rows and maps columns → the ingest payload.
- **Features** — the actual pages (list / detail / CRUD). A billing portal has invoices + payments; a CRM
  has a pipeline; an HR portal has reviews. This is where a distant domain diverges most.
- **Brand** — daisyUI 5 theme (`_themeInit.gsp` / `layout.tsx` → `RB_DEFAULT_THEME` / `DEFAULT_THEME`),
  logo / wordmark, and the document biller. daisyUI ships `corporate`, `business`, `nord`… — a whole
  re-theme is one word.

A field added in the model + ingest + push query carries end to end. **An invoice-like app is ~2/3 done
by copying the billing example (change model + brand); a distant domain (CRM / HR) keeps the convention
but replaces more of the feature code.**

---

## My deliverable: a complete `_custom/` bundle — the user creates it and runs it

Even here it's **guided-development**: the user builds it, I help. I'm a **chat** agent — the user talks
to me on the Next.js chat page or in Element on their phone — so I can't create files or move a folder;
everything I produce is text in the chat. I deliver the `_custom/` **file by file**: for each file I
give its path, then its contents in a fenced, copy-able code block, and the user pastes it into that
file under `_apps/flowkraft/xx-custom/<app-id>/_custom/`. **The user creates the files and runs the
seed** — I'm not a coding assistant that writes the app autonomously. Because I'm re-skinning a shipped
example, `overrides/` holds only the files that actually change — the blueprint provides everything else,
so I'm never writing a full app from scratch. How many files that is scales with the domain: a few for a
billing-variant, more for a distant CRM or HR portal. The files:
- **`app.json`** — the manifest that makes DataPallas treat the folder as an app (and show its card in
  Apps Manager). It sets the app's `id`, display `name`, `port`, `tablePrefix`, `apiKey`, the
  `blueprint` to scaffold from, `"visible": false` (the seed flips it to `true` on first run), and
  `tags: ["custom-app"]` (which earns the "Custom App" badge).
- **`app-seed.groovy`** — a copy of the example's seed script, edited for the user's app: mainly the
  **push-query**, the data script that reads the user's source rows and maps them to the ingest payload
  (omit it if the app takes no DataPallas push). A backend app also needs the compose's relative
  DB-mount path adjusted for its new folder depth.
- **`overrides/`** — only the files the user changed — their **data model, features, and brand**.
  Everything unchanged comes from the blueprint when the seed scaffolds, so it's only the changes: a few
  files for a billing-variant, more for a distant domain like a CRM or HR portal.
- **`README.md`** — the **living record** of the build (see *The build loop* below): the agreed
  requirement in plain language, plus a file-by-file task list with `TODO` / `DONE` status. I keep it
  current the whole way through — it's not a write-once recipe.

Then: *"Once these are all under `_apps/flowkraft/xx-custom/<app-id>/_custom/`, open Seed Data / Apps,
run it, Start the app, Burst. Like the Billing Portal video — but yours."*

For genuinely novel work with no matching example I fall back to my `guided-development` skill and we
pair task-by-task. I recommend **Claude Code** for full coding assistance only if a user insists I write
the whole thing end-to-end.

---

## The build loop: a living `README.md`, one file at a time

For a brand-new app at `_apps/flowkraft/xx-custom/<app-id>/` I don't dump everything at once — I run a
loop the user drives, and `README.md` is the living record of it.

**First, I read the real code.** Before I plan a single file, I read the **full source** of the two best
references for this app — the **blueprint** it scaffolds from (its `flowkraft/…-playground`) and the
**most specific shipped example** for the stack (the matching `billing-portal-grails` / `-next` /
`-bkend`). These are real, working apps, so I reuse their structure, conventions, and actual code as much
as I can — even when the user's domain (HR, CRM, ERP, accounting…) is different — instead of inventing
from zero. (I have a shell — I `ls` and `cat` those folders.)

**Step 0 — agree the plan.** I draft the app's `README.md` (the source of truth) and **present it in the
chat** so we sign off on it before building a single file. It holds two things I keep current for the
whole build:
1. **The requirement, as I understood it**, in plain language. The user reads it and says "yes, that's
   right" or "no — I need *this*, not *that*"; I rewrite it until they're confident I truly got it. It's
   living — I update it whenever the app's reality changes.
2. **A file-by-file task list** — every file the app needs, each with its **path**, a one-line note on
   **what it holds and why**, and a status (`TODO` / `DONE`). This is the plan for Step 1.

**Step 1 — one file per request.** The user says *"Give me next file, please!"* and I reply with **one
file**: its exact path, then its full, correct, complete contents in a copy-able code block — ready to
paste, nothing elided. The user pastes it in; I mark that task `DONE` in `README.md` and wait for the
next request. We repeat until every task is `DONE` and the user says *"Everything works beautifully,
thank you!"*

**I check the disk — I don't just trust the chat.** I never write the app end-to-end, but I *do* read
the files on disk (I have a shell — I `ls` the app folder and `cat` what the user pasted) to confirm
they're on track: if the user says "I did this file" but it's missing or wrong, I say so and we fix it
before moving on.

**`README.md` is mine to keep honest** — keeping it current with the agreed requirement and the real
progress is my responsibility, not the user's. I never force anyone to read it, but I always make sure the
user knows it exists and where it lives (`_apps/flowkraft/xx-custom/<app-id>/README.md`), and I encourage
them to check it regularly — at their own pace, never under any obligation.

---

## Tests — already set up; I read them to build, I rarely write them

A **preconfigured Playwright project** ships at `…/_examples/xx-e2e-testing-playwright/`, and the seed
copies it up to `_apps/flowkraft/xx-custom/xx-e2e-testing-playwright/` on first run, so the user owns it.
It needs **Docker only** — no Node, no Playwright install — and one variable picks the app under test:

```
BASE_URL=http://host.docker.internal:<port> docker compose run --rm e2e \
  npx playwright test tests/<spec>.spec.ts --project=chromium
```

**I read `tests/billing-portal.spec.ts` to learn how the app's code is expected to BEHAVE.** It drives a
real running portal, so it says what "done" means far more precisely than prose can. Above all I read
**`runSecurityScenarios(page, baseUrl)`**: every check in it exists because that exact hole was once
real — a hand-made cookie that made you an admin, an `/api/pay` that settled any id, an interceptor
whose final `return true` left every forgotten controller public. **That function IS the security
contract for a data app: I build the user's app so it would pass, whether or not anyone ever runs it.**

`tests/helpers/screenshots.ts` is there when a picture beats a paragraph — it rings a DOM element, adds
a callout, and files the PNG under `screenshots/<spec>/<timestamp>/` (a fresh folder per run, nothing
overwritten). It is OFF unless `TAKE_SCREENSHOT=true`, so it costs nothing to leave calls in place.

**I do NOT write `*.spec.ts` files by default.** A working app is the deliverable; tests are not part of
it unless the user asks for them — *"we need test code to prove our app works"*. Then I follow
`billing-portal.spec.ts`: one spec shared across stacks, `BASE_URL` picks the app, `getElementById`
only, and assertions that **re-read the data** rather than trust a success panel.

---

## What I keep in mind

- **The examples are references, not the target.** I never tell a user to rebuild the billing portal; I
  build *their* app and cite the example for how each piece is done.
- **Never fork the whole app.** `overrides/` holds only changed files; the blueprint provides the rest.
- **No cleaning session.** The strip list is already in `app-seed.groovy` — I never tell users to
  hand-delete sample code.
- **Idempotent + self-seeding.** Re-running the seed and re-Bursting produces no duplicate rows; the app
  self-seeds demo data on first boot so it looks populated immediately.
- **I ask before I scaffold.** Emitting a bundle is advice; the user creates the files and runs the seed —
  real actions, so I confirm first.
- **Domain features are the user's, not the example's.** I keep the billing example's payments only if the
  user's app is billing-like; an HR / CRM / ERP / Accounting, etc. app has its own. A vastly different app needs **more files under
  `overrides/`** — I still follow the same conventions I see in the examples, but I provide as many
  override files as it actually takes to implement the user's app, not a fixed few.

### Security & auth I always build in (the example already does — I copy how)

*Every rule below is asserted, executably, by `runSecurityScenarios` in the e2e project's
`tests/billing-portal.spec.ts` (see **Tests** above). I read that function as the definitive statement
of what "secure" means here — it is the same list, but provable.*

- **Deny by default, and enforce ownership in the query — not by hiding rows.** Every private route needs
  a session (signed out → `/login`, deep links included), and a signed-in customer sees only their own
  rows because ownership is in the `WHERE` clause — a guessable `/portal/invoices/<id>` must refuse
  another customer's invoice, since a row simply missing from the list is no defence. The Next example
  scopes its reads in `lib/db/scoped.ts` (e.g. `invoiceForSession(id, s)`); Grails filters by the
  signed-in customer, and its `AuthInterceptor` denies by default (a stray `return true` at the end once
  left every forgotten controller public).
- **Gate `/admin` by role, and verify the session cookie.** No customer reaches any `/admin/*` — that's a
  **server-side role check** (Next `requireAdmin()` in `lib/actions.ts`; the Grails interceptor + the
  admin layout), never just a hidden menu. And a hand-made cookie is not a login: Next **signs** it (HMAC
  in `lib/session.ts`, secret from `BP_SESSION_SECRET`), Grails keeps the session **server-side** (an
  opaque JSESSIONID) — pasting `{"role":"ADMIN"}` into the cookie must do nothing.
- **A mutation checks ownership or a capability token — never a bare id.** Unauthenticated pay is a
  feature, but through a per-invoice **token** (like a PayPal checkout link), not "settle any id": the
  example's pay endpoint takes the token with no session, and the id branch only with ownership, so an
  anonymous POST of someone else's id changes nothing. The public token page leaks no session either —
  the invoice and its Print button, no nav or logout, even if the visitor happens to be signed in. The
  risk is exposing data, not receiving money.

### CRUD I always get right (the example already does — I copy how)

- **Full admin CRUD, with a guarded, cascading, integrity-aware delete.** Create / edit / delete both
  invoices and customers. Delete goes through a confirm modal — both **No** (keeps it) and **Yes**
  (removes it) must behave — and it cascades (an invoice takes its line items with it). A customer who
  still has invoices is **refused** deletion (empty them first); one with none is deleted, and their
  login row (`bp_app_user`) goes too.
- **Validate required fields, and keep the natural key stable.** Mandatory is mandatory — the invoice
  dates are `nullable:false`, and a save that fails validation must *surface*, not silently re-render the
  form so "the row never appears." The customer email is the REST upsert key **and** the login username,
  so it is **read-only on edit** — a rename would duplicate the customer on the next Burst and strand
  their login. Creating a customer also creates that login (username = email), idempotently — the same
  pair the REST ingest makes.

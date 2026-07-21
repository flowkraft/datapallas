# Billing Portal (Grails) — example custom app

A customer **billing portal**: customers sign in to see their invoices (paid / due / overdue) and
pay them; an `/admin` area does full invoice + customer CRUD. It is scaffolded from the
`flowkraft/grails-playground` blueprint and is the reference example for the DataPallas `_custom`
app convention.

**Where it lives.** FlowKraft-shipped example apps live under
`_apps/flowkraft/xx-custom/_examples/<app>/`; a user's *own* app lives one level up, directly in the
custom-apps home: `_apps/flowkraft/xx-custom/<app>/`. Both are discovered the same way (see the end of
this file).

Everything authored is in this `_custom/` folder (it always sorts first in Explorer):

    _custom/
      app.json          <- manifest — REQUIRED, this is what makes the folder "an app"
      app-seed.groovy   <- scaffold + wire script, shows up in the Seed Data / Apps dropdown
      overrides/        <- files copied OVER the blueprint, at the same relative paths
      README.md         <- this file (inert — safe to keep or delete)

Everything else in the app folder is generated: on **every** run `app-seed.groovy` wipes the folder to a
clean slate (keeping `_custom/`, runtime data + caches), copies the blueprint
(`_apps/flowkraft/grails-playground`) next to `_custom/`, strips the sample analytics/payslip code, then
copies `overrides/**` on top.

**The one hard rule:** folder name = app `id` = compose service name = container name, kebab-case
(here: `billing-portal-grails`, port `8500`). That single identity is what `system service app
start/stop`, docker compose, and the Apps Manager status matcher all key on.

---

## What this app is made of (the contract)

**Data model** — the portal owns its DB; tables are prefixed (`bp_`; a derived app can set
`"tablePrefix"` in `app.json`):

    bp_customer      (id, name, email UNIQUE, city, country)
    bp_app_user      (id, username UNIQUE, password_hash, role, customer_id)      -- role ∈ {ADMIN, CUSTOMER}
    bp_invoice       (id, invoice_number UNIQUE, customer_id, invoice_date, due_date, status,
                      subtotal, tax, freight, total, pay_token, paid_at, payment_method, payment_reference)
    bp_invoice_line  (id, invoice_id, product_name, qty, unit_price, discount, line_total)

`status ∈ {PAID, DUE, OVERDUE}`; `total = subtotal + tax + freight`.

**REST API (how DataPallas fills it).** `POST /api/invoices` with header
`X-Api-Key: <app.json apiKey>` and a JSON body `{ invoice_number, invoice_date, due_date, status,
subtotal, tax, freight, total, customer:{name,email,city,country}, lines:[{product_name,qty,unit_price,discount}] }`.
Idempotent: upsert customer by email, ensure a CUSTOMER login (never recreated), upsert invoice by
number + replace its lines. The `app-seed.groovy` writes a DataPallas PUSH report
(`config/reports/billing-portal-grails`, UI label **Bills Portal (Grails)**) — a `ds.scriptfile` over the
bundled **Northwind** sample DB (Orders + Order Details for ALFKI + ANATR) that nests each order's line
items, whose native `<httpcommand>` curl posts each invoice's rendered JSON here. The portal renders the
invoices. Burst it from Processing → Generate Reports.

**Payments (first-class).** The real Stripe + PayPal integration is kept. `PaymentGatewayService` uses
the live gateway when `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` (or `PAYPAL_CLIENT_ID`) are set,
else a **simulated settle** so the demo works with zero config.

**Pre-known logins (seeded on first boot; used by `apps-custom.spec.ts`):**

| username | password | role | sees |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | `/admin` — everything |
| `alice@demo.io` | `demo1234` | CUSTOMER | `INV-DEMO-0001` PAID, `INV-DEMO-0002` OVERDUE |
| `bob@demo.io` | `demo1234` | CUSTOMER | `INV-DEMO-0003` DUE |
| `carol@demo.io` | `demo1234` | CUSTOMER | `INV-DEMO-0004` PAID, `INV-DEMO-0005` DUE (pay-token `demo-pay-token-0005`) |

## E2E DOM-id contract (both stacks MUST match exactly)

`apps-custom.spec.ts` selects **only** by `document.getElementById` — never class/text/xpath. Both the
Grails and Next.js apps expose the identical ids:

| id | where |
|---|---|
| `login-username`, `login-password`, `btn-login`, `login-error` | `/login` |
| `current-user`, `btn-logout` | portal + admin header (when signed in) |
| `invoice-list` | customer invoice table (`/portal/invoices`, `/portal`) |
| `invoice-row-<invoice_number>`, `invoice-status-<invoice_number>` | each invoice row (portal + admin) |
| `admin-invoice-count`, `admin-customer-count`, `admin-paid-count`, `admin-due-count`, `admin-overdue-count` | `/admin` dashboard stats |
| `admin-invoices` | admin invoice table (`/admin/invoices`) |
| `btn-new-invoice` | admin — new invoice |
| `admin-customers`, `customer-row-<email>` | `/admin/customers` |
| `pay-amount`, `btn-pay`, `pay-success` | pay page (`/portal/invoices/<id>/pay`, `/portal/pay?token=…`) |

Routes are also identical: `/login`, `/logout`, `/portal`, `/portal/invoices`, `/portal/invoices/<id>`,
`/portal/invoices/<id>/pay`, `/portal/pay?token=…`, `/admin`, `/admin/invoices[/create|/<id>[/edit]]`,
`/admin/customers[/<id>]`, `POST /api/invoices`, `/payment/*`.

---

## Recipe: make your own app from this one

### 1. Copy the `_custom/` folder
Copy this `_custom/` to your target. A **user app** goes at
`_apps/flowkraft/xx-custom/<your-app-id>/_custom/`; another **FlowKraft example** goes one level deeper,
at `_apps/flowkraft/xx-custom/_examples/<your-app-id>/_custom/`.

### 2. Find & replace across the copied `_custom/`
| Find | Replace with | Covers |
|------|--------------|--------|
| `billing-portal-grails` | `hr-portal` | id, service_name, entrypoint, startCmd/stopCmd, APP_ID |
| `Billing Portal (Grails)` | `HR Portal` | display name (card + Seed Data / Apps dropdown label) |
| `8500` | a free port, e.g. `8510` | url, launchLinks, startCmd |

In `app-seed.groovy` set **`BASE_PATH`**: `'flowkraft/xx-custom/'` for a user app, or
`'flowkraft/xx-custom/_examples/'` for another shipped example. Ports already taken by the billing
examples: 8500 (grails), 8501 (next), 8502 (bkend); plus 8080 (cms-webportal), 8440 (ai-hub),
8978 (cloudbeaver).

### 3. Pick your blueprint in `app-seed.groovy`
    String BLUEPRINT = 'flowkraft/grails-playground'   // or next-playground / bkend-boot-groovy-playground
Match the **compose-patch block** to the blueprint (each uses different service/volume names; the
`next` compose hardcodes its host port; the `bkend` compose mounts the Northwind DB by a depth-sensitive
relative path — `../../../../../db` from `_examples/` — that must be adjusted for the app's location).
Also update `"blueprint"` in `app.json` (informational).

### 4. Swap the data model + overrides
Replace the `overrides/` (domain, controllers, views) and the strip-list with your own. Keep the
house rules: idempotent, explicit IDs, never touch Northwind tables.

### 5. Run it
Open any DB connection → **Seed Data / Apps** tab → pick your app in the **Custom Seed Script** dropdown →
Run. Every run wipes the app folder to a clean slate (keeping `_custom/`), re-copies the blueprint,
strips samples, applies `overrides/**`, writes the DataPallas report config, and flips `"visible": true`
— your card appears in Apps Manager on the next refresh, Start/Stop wired up.

---

## Maintenance & discovery

- **Re-apply / re-scaffold:** just run the seed script again — every run already wipes the app folder to
  a clean slate (keeping `_custom/`, runtime data + caches) and regenerates it, so there is no separate
  manual re-scaffold step. **Remove:** `docker compose down -v` in the app folder, then delete the folder.
- **Discovery:** the backend scans `_apps/flowkraft/xx-custom/*/_custom/` **and**
  `_apps/flowkraft/xx-custom/_examples/*/_custom/` at runtime (via `Utils.getCustomAppDirs()`): every
  `app.json` is served to the Apps Manager (`GET /api/system/apps`) and every `app-seed.groovy` is listed
  in the **Seed Data / Apps** dropdown. No registration, no restart — the folder IS the registration.

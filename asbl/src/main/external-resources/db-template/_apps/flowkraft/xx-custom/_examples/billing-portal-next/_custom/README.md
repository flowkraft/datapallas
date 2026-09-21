# Billing Portal (Next.js) — example custom app

The **101% mirror** of `billing-portal-grails`, on the Next.js stack. Same routes, same DOM ids,
same UI, same behaviour — so `apps-custom.spec.ts` runs identically against it. Only the
implementation differs: Next 15 App Router + Drizzle/better-sqlite3 + a lightweight cookie session,
scaffolded from `flowkraft/next-playground` (port `8501`).

**The data model, REST ingest contract, payments, pre-known logins, DOM-id contract and routes are
identical to the Grails example — see `../billing-portal-grails/_custom/README.md` for the full spec.**
This folder only holds what differs (the Next implementation), under `overrides/`.

Structure (the `_custom` convention — same as every custom app):

    _custom/
      app.json          <- manifest (id billing-portal-next, blueprint flowkraft/next-playground, port 8501)
      app-seed.groovy   <- wipe → copy blueprint → strip samples → apply overrides → write push report → reveal
      overrides/        <- the Next.js billing app (bp_ drizzle schema, cookie auth, ingest, portal + admin pages, self-seed)
      README.md         <- this file

Run it from any DB connection's **Seed Data / Apps** tab → **Billing Portal (Next.js)** → Run.

## Going live: the portal URL

The seed writes `http://localhost:8501` into this app's report (`config/reports/billing-portal-next/settings.xml`)
as a **default**, right only for a demo on your own machine. The URL is in two places. Before emailing real
customers, open the report in **Configuration** and change both to the portal's public address
(e.g. `https://billing.example.com`):

- **Web Upload → DataPallas Web**: the curl command that pushes each invoice (`…/api/invoices`).
- **Email** message: the one-click pay link and the sign-in link the customer receives.

Alternatively, set `"url"` in `_custom/app.json` and re-run the seed script, which rewrites both. Re-seeding
resets the report's other settings too. In the DataPallas Docker server the default `localhost` push
works as is: DataPallas re-addresses it to the portal's container.

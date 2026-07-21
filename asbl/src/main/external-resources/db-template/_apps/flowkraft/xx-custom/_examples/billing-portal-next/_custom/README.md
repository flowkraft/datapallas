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

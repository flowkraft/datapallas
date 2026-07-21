# Billing Portal Backend (crons, etc.) — example custom app

The headless backend companion to the billing-portal examples. A Spring Boot + Groovy app scaffolded
from `flowkraft/bkend-boot-groovy-playground`, kept **exactly** as the blueprint ships it — same
starters (security, session-jdbc, jdbc, quartz, data-rest, integration…), same datasource, same
shared db mount. The `_custom` changes are minimal and **additive**:

- **Strip** only the reference-only custom code: `src-examples/`.
- **Add** the billing cron: `src/main/groovy/com/flowkraft/bkend/crons/BillingPortalCron.groovy`
  (+ `SchedulingConfig.groovy` to enable `@Scheduled`, so `BkendApplication` is untouched).
- **Compose**: rename the service/container/image to `billing-portal-bkend`, adjust the blueprint's
  db mount's relative depth (this app sits under `xx-custom/_examples/`), **mount the shared portal DB
  dir** (`../_shared-db → /app/shared`), set port `8502`, and add `BP_CRON_MARK_OVERDUE`.

## What the cron does — shared database, direct writes

The billing portals write their SQLite DB file into a **shared directory** (`_examples/_shared-db/`:
Grails → `grails-portal.db`, Next → `next-portal.db`), which this backend also mounts (`/app/shared`). On a
schedule (`BP_CRON_MARK_OVERDUE`, hourly by default) — and once ~6s after startup — the cron opens
each portal DB file **directly** and flips every **DUE** invoice past its **due date** to **OVERDUE**.
No REST: the bkend shares the portals' database.

The two portals store the same `bp_` data with slightly different conventions (GORM vs Drizzle), so
`due_date` is parsed flexibly. Concurrency is demo-grade (SQLite WAL + busy-timeout; the cron runs
infrequently) — swap to a shared Postgres if you productionize.

## Structure (`_custom` convention)

    _custom/
      app.json          <- id billing-portal-bkend, blueprint bkend-boot-groovy-playground, port 8502, launch:false
      app-seed.groovy   <- wipe → copy blueprint → strip src-examples → apply overrides → reveal
      overrides/        <- docker-compose.yml + the billing cron (SchedulingConfig + BillingPortalCron)
      README.md         <- this file

Run it from any DB connection's **Seed Data / Apps** tab → **Billing Portal Backend (crons, etc.)** →
Run. It appears as a headless app card (no Launch button); Start/Stop it like any app. It marks overdue
invoices by opening the portals' **shared SQLite DB directly** (see above) — no REST.

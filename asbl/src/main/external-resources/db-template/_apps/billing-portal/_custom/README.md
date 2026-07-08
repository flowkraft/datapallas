# Creating your own custom app

`billing-portal` is the reference example for DataPallas custom apps. Everything you
author lives in this `_custom/` folder (it always sorts first in Explorer):

    _custom/
      app.json          <- manifest — REQUIRED, this is what makes the folder "an app"
      app-seed.groovy   <- optional: scaffold + seed script, shows up in the Seed Data dropdown
      overrides/        <- optional: files copied OVER the blueprint, same relative paths
      README.md         <- this file (inert — safe to keep or delete)

Everything else in the app folder is generated: the seed script copies a blueprint
(`_apps/flowkraft/grails-playground`, `next-playground`, or `bkend-boot-groovy-playground`)
next to `_custom/` on first run.

**The one hard rule:** folder name = app `id` = compose service name = container name,
kebab-case. That single identity is what `system service app start/stop`, docker compose,
and the Apps Manager status matcher all key on.

---

## Recipe: new app in 5 steps

### 1. Copy this folder

Copy `_apps/billing-portal` to `_apps/<your-app-id>` (e.g. `_apps/hr-portal`).
If billing-portal was already scaffolded on your machine, delete everything in the copy
EXCEPT `_custom/`, and inside `_custom/app.json` set `"visible"` back to `false`.

### 2. Find & replace across the copied `_custom/` folder

Three replace-alls (they cover `app.json` AND `app-seed.groovy` at once):

| Find             | Replace with              | Covers                                              |
|------------------|---------------------------|-----------------------------------------------------|
| `billing-portal` | `hr-portal`               | id, service_name, entrypoint, startCmd/stopCmd, APP_ID |
| `Billing Portal` | `HR Portal`               | display name (card title + Seed Data dropdown label) |
| `8500`           | a free port, e.g. `8510`  | url, launchLinks, startCmd port                      |

Ports already taken by bundled apps: 8080 (cms-webportal), 8400 (grails blueprint),
8410 (bkend blueprint), 8420 (next blueprint), 8440 (ai-hub), 8500 (billing-portal),
8978 (cloudbeaver), 8081 (matomo), 4440 (rundeck), 3000 (metabase), 3001 (docuseal).

Then polish `app.json` by hand: `description`, `category`, `icon`, `tags`, `launchLinks`
(drop `/portal`–`/admin` if your app has different routes). Keep `"visible": false` —
the seed script flips it to `true` on first successful run.

### 3. Pick your blueprint in `app-seed.groovy`

Set the constant near the top:

    String BLUEPRINT = 'flowkraft/grails-playground'        // or:
    // String BLUEPRINT = 'flowkraft/next-playground'
    // String BLUEPRINT = 'flowkraft/bkend-boot-groovy-playground'

Also update `"blueprint"` in `app.json` (informational). Then adjust the
**compose-patch block** (the `composeFile.text = ...` lines) to match — each blueprint
uses different service/volume names. Use SINGLE-quoted Groovy strings so `${HOST_PORT}`
stays literal:

**grails-playground** (what this example ships with):

    composeFile.text = composeFile.text
            .replace('grails-playground', APP_ID)
            .replace('flowkraft-data', APP_ID + '-data')
            .replace('flowkraft-logs', APP_ID + '-logs')

**next-playground** — its compose hardcodes the host port, so parameterize it too:

    composeFile.text = composeFile.text
            .replace('next-playground', APP_ID)                    // service, container, volume
            .replace('"8420:3000"', '"${HOST_PORT:-8420}:3000"')   // startCmd port now wins

**bkend-boot-groovy-playground** — fix the relative db mount (custom apps live one
level shallower than `_apps/flowkraft/*`):

    composeFile.text = composeFile.text
            .replace('bkend-boot-groovy-playground', APP_ID)       // service, image, container
            .replace('../../../db', '../../db')                    // _apps/<app>/ -> portable root

### 4. Replace the demo seed section

Section "c)" of `app-seed.groovy` creates `bp_customer` / `bp_invoice` demo tables.
Swap in your own tables and data. Keep the house rules from the Seed Data examples:
DROP THEN CREATE (idempotent), explicit IDs, DataFaker with a fixed seed, and never
touch Northwind tables. Delete the section entirely if your app needs no seeded data.

Add files under `_custom/overrides/` for every blueprint file you want to customize —
datasource config, views, controllers — see `overrides/HOW-OVERRIDES-WORK.md`.

### 5. Run it

Open any database connection → **Seed Data** tab → pick your app in the
**Custom Seed Script** dropdown → Run. The script:

  a) copies the blueprint into `_apps/<your-app-id>/` (first run only),
  b) applies `_custom/overrides/**` (every run),
  c) reseeds your tables on the selected connection (every run),
  d) flips `"visible": true` — your card appears in Apps Manager on the next refresh,
     with Start/Stop wired up automatically. A `custom-app` tag is added for filtering
     (it drives the "Custom App" card badge and the "View Custom Apps" link).

---

## Maintenance

- **Re-apply customizations / reseed:** just run the seed script again.
- **Re-scaffold from a clean slate:** delete everything in the app folder EXCEPT
  `_custom/`, then run the seed script again.
- **Remove the app:** run `docker compose down -v` inside the app folder (drops its
  containers + volumes), then delete the folder. The card and dropdown entry disappear
  on the next refresh.

## How discovery works (under the hood)

The backend scans `_apps/*/_custom/` at runtime: every `app.json` is served to the
Apps Manager via `GET /api/system/apps`, and every `app-seed.groovy` is listed in the
Seed Data dropdown (description = the `// @description` first line; name = `app.json`
`name`). No registration, no restart — the folder IS the registration.

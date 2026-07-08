# Building Data Apps Skill

I use this when teaching **data modeling** — to make a schema tangible. A learner designs a
model with me, then we scaffold a tiny working app around it so they *see* their tables become
a real portal or dashboard in minutes. Nothing cements a data model like watching it come
alive. This is a teaching aid, not a production-build service — for real apps, that's Athena
and the AI Crew.

---

## The idea: a model you can touch

Data modeling stays abstract on a whiteboard. So after a learner and I design a small schema
(customers, invoices, whatever the lesson calls for), I spin up a throwaway DataPallas custom
app seeded with that exact model. They query it, see rows, maybe a dashboard — and the design
decisions we just discussed (a half-open date range, a foreign key, one table vs two) become
concrete. Then we change the model and watch what changes.

---

## The `_custom` app convention (how DataPallas custom apps work)

A custom app is any folder under **`/datapallas/_apps/<app-id>/`** that contains a
**`_custom/`** subfolder. Everything the author writes lives in `_custom/` (it sorts first in
the file listing, so it's always easy to find among hundreds of scaffolded files):

```
/datapallas/_apps/<app-id>/
  _custom/
    app.json          ← manifest (REQUIRED) — this is what makes the folder "an app"
    app-seed.groovy   ← optional: scaffold + seed script; appears in the Seed Data dropdown
    overrides/        ← optional: files copied OVER the blueprint, same relative paths
    README.md         ← how-to for creating your own (inert)
  docker-compose.yml  ← the rest is scaffolded from a blueprint on first run
  ...
```

**The one hard rule:** folder name = app `id` = compose service name = container name
(kebab-case). That single identity is what start/stop, docker compose, and the Apps Manager
status matcher all key on.

**The worked example ships in the product:** `/datapallas/_apps/billing-portal/_custom/`. Its
`README.md` is the step-by-step recipe for creating a new app — **I read it first** and adapt
it rather than inventing from scratch.

---

## How it runs (and why it fits teaching)

The `app-seed.groovy` script is listed in the **Seed Data** tab of any database connection
(the same dropdown as "Invoice Seeder" / "Wipe Invoices"). Running it does three things, all
idempotent:

1. **Scaffold** — on first run, copy a blueprint (`flowkraft/grails-playground`,
   `next-playground`, or `bkend-boot-groovy-playground`) into the app folder, renaming the
   compose service/container/volumes to the app id.
2. **Apply overrides** — copy everything under `_custom/overrides/` over the app, every run,
   so customizations re-apply.
3. **Seed the model** — DROP-then-CREATE the app's own tables on the selected connection and
   fill them with DataFaker data (fixed seed = identical every run).

On first success the script flips `"visible": false → true` in `app.json`, and the app's card
appears in the DataPallas **Apps Manager** with Start/Stop wired up automatically. For a
lesson, that means: design → seed → the learner has a running app on their own model. Discovery
is convention-based (the backend scans `_apps/*/_custom/app.json` and `*/app-seed.groovy` at
runtime) — no registration, no restart.

---

## My teaching workflow with this skill

1. **Design the model** — with my `data-modelling` skill: the simplest schema that serves the lesson (usually 2–5 tables), universal patterns, explained trade-offs.
2. **Copy the example** — start from `/datapallas/_apps/billing-portal/_custom/`, following its `README.md`: copy the folder to a new `<app-id>`, find-and-replace the id / display name / port, pick a blueprint.
3. **Put the model in the seed script** — replace the demo tables in `app-seed.groovy`'s seed section with the schema we designed; keep the house rules (DROP-then-CREATE, DataFaker with a fixed seed, never touch Northwind tables).
4. **Run it from the Seed Data tab** — the learner watches the app scaffold and their model fill with data.
5. **Iterate on the model** — change a table, re-run, see the difference. This is where modeling clicks.

---

## What I keep in mind

- **This is a practice aid.** These are small, disposable teaching apps — I don't dress them up as production systems. When a learner wants to build something real, I hand them to Athena to write a PRD with the AI Crew.
- **Blueprints have quirks I respect.** Each blueprint (Grails / Next.js / Spring Boot) needs slightly different compose edits in the seed script — the `billing-portal` README spells them out; I follow it rather than guessing.
- **The seed runs against a real connection**, so the app's data lives in whatever database the learner picked in the Seed Data tab — a natural teaching point about where their model actually lives.
- **I ask before I scaffold.** Creating files and seeding a database are real actions; I confirm with the learner first.
- **Clean re-scaffold:** delete everything in the app folder except `_custom/`, then run the seed again — the learner's whole customization is that one folder.

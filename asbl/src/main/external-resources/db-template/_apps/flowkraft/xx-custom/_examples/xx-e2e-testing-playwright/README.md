# xx-e2e-testing-playwright

The most common Playwright end-to-end project layout — wrapped in **Docker** so you can write and
run `*.spec.ts` tests on a machine with **no Node.js and no Playwright installed**. If it has
Docker, it can run these tests.

## Do I need Jasmine / Mocha / Jest?

**No.** `@playwright/test` is a complete test framework — it ships its own runner and its own
`test()` / `expect()` assertions. Adding Jasmine, Mocha or Jest would be redundant and is not how
modern Playwright projects are written.

## Layout

```
package.json            # @playwright/test + npm scripts
playwright.config.ts    # test dir, browsers, reporter, baseURL
tsconfig.json           # editor type-checking (Playwright compiles TS itself)
tests/
  example.spec.ts        # the canonical starter spec (runs against playwright.dev)
  billing-portal.spec.ts # drives a running billing portal (Grails or Next) — chosen by BASE_URL
  helpers/
    screenshots.ts       # opt-in annotated screenshots (ring a DOM element + callout)
Dockerfile              # FROM the official Playwright image (Node + browsers baked in)
docker-compose.yml      # `e2e` service (run tests) + `report` service (view the HTML report)
.dockerignore
.gitignore
```

## Requirements

Just **Docker** (Desktop or Engine) with Compose v2. No Node, no `npx playwright install`.

## Write a test

Edit or add any `tests/*.spec.ts` with a plain text editor — no Node needed:

```ts
import { test, expect } from '@playwright/test';

test('my first test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});
```

## Run

```bash
# build once (installs deps into the image; the browsers are already in the base image)
docker compose build

# run the whole suite
docker compose run --rm e2e

# run a SINGLE spec file
docker compose run --rm e2e npx playwright test tests/example.spec.ts

# run one test by title
docker compose run --rm e2e npx playwright test -g "has title"

# a single browser
docker compose run --rm e2e npx playwright test --project=chromium
```

Reports, traces and screenshots are written to `playwright-report/` and `test-results/` **on your
host** (they are bind-mounted), so you can inspect them without Node.

## Testing a running app — the pattern

The spec is shared; **`BASE_URL` alone decides which app it tests**:

```bash
BASE_URL=<app-url> docker compose run --rm e2e npx playwright test tests/<spec>.spec.ts --project=chromium
```

The app runs on **your machine** (in its own container, with its port published), so from inside
this container reach it as `host.docker.internal` — `localhost` in there is the container itself.

```bash
# Billing portal — Grails
BASE_URL=http://host.docker.internal:8500 docker compose run --rm e2e npx playwright test tests/billing-portal.spec.ts --project=chromium

# Billing portal — Next.js   (the SAME spec, the same assertions — only the port differs)
BASE_URL=http://host.docker.internal:8501 docker compose run --rm e2e npx playwright test tests/billing-portal.spec.ts --project=chromium
```

`--project=chromium` matters here: app specs mutate the app's database (they pay invoices, delete
customers), so running the same body across chromium+firefox+webkit would have the 2nd browser fail
on data the 1st already moved.

Adding another app or spec is one more line of the same shape — nothing else changes.

**Precondition:** the app must already be running at that URL with its seeded demo data — this
project only drives it.

## Screenshots — off by default

Add `TAKE_SCREENSHOT=true` to any run and the spec also captures annotated PNGs, each ringing a
specific DOM element with a callout saying why it matters:

```bash
TAKE_SCREENSHOT=true BASE_URL=http://host.docker.internal:8500 \
  docker compose run --rm e2e npx playwright test tests/billing-portal.spec.ts --project=chromium
```

They land **on your machine** (the project is bind-mounted) under:

```
screenshots/<spec-file>/<yyyy.MM.dd_HH.mm.ss.SSS>/
```

One folder per run, so a re-run never overwrites the previous one. Working that path out is
entirely `tests/helpers/screenshots.ts`'s job — a spec just says
`captureScreenshot(page, '01-thing.png')` and knows nothing about paths or timestamps.

Without the flag every capture is a **no-op**, so specs can call them unconditionally and an
ordinary run pays nothing.

`tests/helpers/screenshots.ts` gives you:

| Function | What it does |
|---|---|
| `captureScreenshot` | plain viewport shot |
| `captureScreenshotWithHighlight` | ring ONE element (+ optional callout) — the workhorse |
| `captureScreenshotWithHighlights` | ring SEVERAL elements in one shot |
| `captureScreenshotOfElement` | one element's box, Lanczos3-downsampled (optional bottom-trim) |
| `captureScreenshotFitToViewport` | full page, Lanczos3-downsampled to the viewport |
| `captureScreenshotWholeContent` | the ENTIRE content of a scrollable container (beats `fullPage`) |
| `captureScreenshotCenteredOn` | scroll an element mid-viewport, then shoot |
| `captureScreenshotWithOverlay` | inject an HTML callout/arrow, shoot, remove it |
| `hideToastsForScreenshots` | stop toasts leaking into shots |

The rings are applied as inline CSS on the element's own node, so the browser lays them out at the
moment of capture — no bounding-box maths, no drift — and everything is reverted afterwards.

`sharp` is a dependency for exactly one reason: **Lanczos3**, the gold standard for downscaling. It
keeps thin strokes and small text crisp where bilinear/bicubic smear them.

## View the HTML report

```bash
docker compose up report
# open http://localhost:9323
```

## Keeping the Playwright version in sync

The version is pinned in **two** places that must match: `@playwright/test` in `package.json` and
the image tag in `Dockerfile` (`mcr.microsoft.com/playwright:vX.Y.Z-jammy`). Bump both together,
then `docker compose build`.

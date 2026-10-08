// ═══════════════════════════════════════════════════════════════════════════════
// dashboard-demos-test-helper.ts
// The installation the Dashboard Demos are met in, and the stories they offer
// (sections 9.3 and 6).
//
// WHAT THIS DOES AND WHAT IT DOES NOT
//
// Everything here talks to the server: it loads the demo data again on the day
// the checks were computed for, it mints and takes back the Gallery's share
// link, and it clicks the questions a dashboard was written to answer. What a
// tile then shows is `published-dashboard-checks.ts`, and which demos exist is
// `demo-catalog.ts`. Nothing here restates a demo, a filter or a number.
//
// It sends no SQL of its own. The demo data is the product's own seed script
// (`db/scripts/dashboards-demo-data.groovy`), sent as it ships, exactly as the
// Cube Stories spec sends the cube demo's.
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Locator, type Page } from '@playwright/test';

import {
  DASH_DEMO_CONNECTION,
  GALLERY_REPORT_ID,
  asText,
  dashDemoSeedScript,
  declaredParams,
  demoOf,
  loadChecks,
  loadStories,
  widgetOf,
  type Demo,
  type Kpi,
  type Story,
} from './dashboard-demos/demo-catalog';
import { reading, shows, waitForChartsIn } from './dashboard-demos/published-dashboard-checks';

/** One call as the installation's administrator: seeding, share links. */
export type AdminFetch = (url: string, init?: RequestInit) => Promise<globalThis.Response>;

/**
 * The demo data is seeded when the installation is made and its dates are moved to that day, so the
 * same package seeded on another day answers other months. Every checks file was computed for this
 * one day (`dataToday`), which is what makes each of its numbers a truth on any day the run happens.
 */
export const DASH_DEMO_SEED_PARAMS = { wipe: true, today: '2026-09-30' };

/** The demo whose first claim the seed is waited on: the first dashboard of the Gallery. */
const FIRST_DEMO = 'dd-executive-overview';

/** What a story that changes no filter is checked by: the view the dashboard opens on. */
const DEFAULT_VIEW = 'defaults';

// ── The data the demos show ───────────────────────────────────────────────────

/**
 * Load the Dashboard Demos' data again, on the day the checks were computed for.
 *
 * `run-seed` accepts the script and answers at once, while the load itself goes on behind it - so
 * the wait is on the data and not on the call: the first demo's first claim, asked of the live
 * dashboard until it is the number that claim says. While the tables are being dropped and written
 * the question fails or answers the rows that were there before, and both are waited through.
 *
 * That number is read by the report's own script, which can answer a moment before the seed job has
 * closed its connection to the file. The page then reads through the server's shared pool on that
 * file, and a pool opened in that moment can find the seed's log still to be folded in and fail. So
 * the wait ends on the page's own first question too - the report's config, which opens that pool -
 * and a try that lands in that moment is simply asked again.
 */
export async function reseedDashDemoData(adminFetch: AdminFetch, baseUrl: string): Promise<void> {
  const accepted = await adminFetch(`${baseUrl}/api/connections/${DASH_DEMO_CONNECTION}/run-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: dashDemoSeedScript(), params: DASH_DEMO_SEED_PARAMS }),
  });
  expect(accepted.status, 'the demo data seed was accepted').toBe(200);
  expect((await accepted.json()).ok, 'the demo data seed was accepted').toBeTruthy();

  const demo = demoOf(FIRST_DEMO);
  const checks = loadChecks(FIRST_DEMO);
  expect(
    DASH_DEMO_SEED_PARAMS.today,
    `the checks were computed for ${checks.dataToday}, so the seed has to pin that day`,
  ).toBe(checks.dataToday);

  const kpi = checks.kpis[0];
  const widget = widgetOf(FIRST_DEMO, kpi.widget);

  await expect
    .poll(
      async () => {
        try {
          const answer = await adminFetch(
            `${baseUrl}/api/reports/${demo.reportId}/data`
              + `?componentId=${encodeURIComponent(widget.componentId)}`,
          );
          if (answer.status !== 200) return false;
          const body = await answer.json();
          const rows = (body.data ?? body.rows ?? []) as Array<Record<string, unknown>>;
          return shows(kpi.value, reading(widget, rows, kpi));
        } catch (theSeedIsStillRunning) {
          return false;
        }
      },
      { timeout: 900_000, intervals: [5_000] },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        try {
          return (await adminFetch(`${baseUrl}/api/reports/${demo.reportId}/config`)).status;
        } catch (theSeedIsStillRunning) {
          return -1;
        }
      },
      { timeout: 900_000, intervals: [5_000] },
    )
    .toBe(200);
}

// ── The link the Gallery is read by ───────────────────────────────────────────

/**
 * A share link for the Gallery: one credential, the 25 dashboards its page holds, and nothing else.
 *
 * The server works out what a Gallery link opens by reading the page, so this asks for the Gallery
 * and never lists the demos: a demo added to the index and the page is opened by the same call.
 */
export async function createGalleryShareLink(
  adminFetch: AdminFetch,
  baseUrl: string,
  lockedParams?: Record<string, unknown>,
): Promise<string> {
  const created = await adminFetch(`${baseUrl}/api/embed/share-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: GALLERY_REPORT_ID,
      ...(lockedParams ? { lockedParams } : {}),
    }),
  });
  expect(created.status, 'a share link for the Gallery').toBe(200);
  const made = await created.json();
  expect(made.token, 'the raw token is returned once, at creation').toBeTruthy();
  return made.token as string;
}

/** And the link is taken back, so a run leaves nothing behind that opens anything. */
export async function revokeGalleryShareLinks(adminFetch: AdminFetch, baseUrl: string): Promise<void> {
  const links = await adminFetch(
    `${baseUrl}/api/embed/share-link?reportId=${encodeURIComponent(GALLERY_REPORT_ID)}`,
  ).then((r) => r.json());
  for (const link of links ?? [])
    await adminFetch(`${baseUrl}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
}

// ── The questions a dashboard offers ──────────────────────────────────────────

/** The stories a demo ships, which are the ones its dashboard must offer (section 6). */
export function storiesOf(id: string): Story[] {
  return loadStories(id);
}

/** Where a demo's stories are drawn: one block per dashboard, named after the report. */
export function storiesRoot(root: Locator, demo: Demo): Locator {
  return root.locator(`#stories-${demo.reportId}`);
}

/**
 * Every story the dashboard ships is offered, in the file's order, with its question and its text
 * written out - and a Reset for the dashboard, one and not one per story.
 */
export async function assertStoriesAreOffered(root: Locator, demo: Demo): Promise<void> {
  const stories = storiesOf(demo.id);
  const block = storiesRoot(root, demo);
  if (stories.length === 0) {
    await expect(block, `${demo.id} ships no stories, so it offers none`).toHaveCount(0);
    return;
  }
  await expect(block, `${demo.id} offers its questions above its filter bar`)
    .toBeVisible({ timeout: 60_000 });

  for (const story of stories) {
    const card = root.locator(`#story-${demo.reportId}-${story.id}`);
    await expect(card, `${demo.id} offers the story '${story.id}'`).toBeVisible({ timeout: 30_000 });
    await expect(card, `the story '${story.id}' asks its question`).toContainText(story.question);
    await expect(card, `the story '${story.id}' says what the reader will find`)
      .toContainText(story.text);
    await expect(
      root.locator(`#btnShowMe-${demo.reportId}-${story.id}`),
      `the story '${story.id}' can be shown`,
    ).toBeVisible({ timeout: 30_000 });
  }
  await expect(
    root.locator(`#btnStoryReset-${demo.reportId}`),
    `${demo.id} offers one Reset for the dashboard`,
  ).toHaveCount(1);
}

/**
 * A story shown the way a reader shows it: the button, and the dashboard reloading where it stands.
 *
 * Show Me sets the story's values on this dashboard's own filter bar and asks again - it never
 * navigates, which is what lets a story work on a Gallery card as well as on the demo's own page.
 * So what is waited for is this card's charts drawing again, and the page stays the page it was.
 * The address bar does take the view (`replaceState`, under this card's keys); the spec reads that.
 */
export async function clickShowMe(root: Locator, demo: Demo, storyId: string): Promise<void> {
  const pageBefore = new URL(root.page().url()).pathname;
  await root.locator(`#btnShowMe-${demo.reportId}-${storyId}`).click();
  await expect(
    root.locator(`#story-${demo.reportId}-${storyId}`),
    `the story '${storyId}' is marked as the one that was asked`,
  ).toHaveClass(/rb-hint-asked/, { timeout: 30_000 });
  await waitForChartsIn(root);
  expect(new URL(root.page().url()).pathname, 'Show Me sets the filters; it does not navigate')
    .toBe(pageBefore);
}

/** Reset, which puts every filter of this dashboard back to its default. */
export async function clickReset(root: Locator, demo: Demo): Promise<void> {
  await root.locator(`#btnStoryReset-${demo.reportId}`).click();
  await waitForChartsIn(root);
}

/**
 * The claims a story leads a reader to: the filter values it ends on, and what the tiles then show.
 *
 * A story's `check` names where those live - one of the demo's interactions, or `defaults` for a
 * story that changes no filter and points at the view the dashboard opens on (a column the reader
 * sorts by, say). So a story is checked by exactly the numbers the tests already hold that
 * dashboard to, and neither file repeats the other's.
 */
export function claimsOf(id: string, story: Story): { params: Record<string, unknown>; kpis: Kpi[] } {
  const checks = loadChecks(id);
  if (story.check === DEFAULT_VIEW) return { params: checks.defaults, kpis: checks.kpis };
  const interaction = (checks.interactions ?? []).find((one) => one.id === story.check);
  if (!interaction)
    throw new Error(`${id}'s story '${story.id}' is checked by '${story.check}', and its checks file`
      + ` has ${DEFAULT_VIEW} and ` + (checks.interactions ?? []).map((one) => one.id).join(', '));
  return { params: interaction.params, kpis: interaction.kpis };
}

/**
 * The stories and the checks say the same thing about the same dashboard.
 *
 * Every story asks something, says what will be found, is checked by a view that exists, and sets
 * only filters this dashboard has. Where a story names a value outright, that value is the one its
 * check was computed for - so a story whose filters no longer match its numbers is caught here,
 * rather than read as prose that happens to be wrong.
 *
 * A story may write a date the way a default does (`{dataToday:startOf week}`, resolved against the
 * day the data was seeded for, `DashboardParameters.values`). That is not a literal, so what is
 * asserted about it is that the dashboard declares the filter - the resolved day is the server's.
 * A check also carries values no filter answers - the label of the thing that was picked, which its
 * SQL needs - and those are not a story's to set.
 */
export function expectStoriesAndChecksAgree(id: string): Story[] {
  const demo = demoOf(id);
  const stories = storiesOf(id);
  const declared = new Set(declaredParams(id).map((p) => p.id));

  for (const story of stories) {
    expect(story.question.length, `${demo.id}'s story '${story.id}' asks a question`)
      .toBeGreaterThan(0);
    expect(story.text.length, `${demo.id}'s story '${story.id}' says what will be found`)
      .toBeGreaterThan(0);

    const { params } = claimsOf(id, story);
    for (const [name, value] of Object.entries(story.params ?? {})) {
      expect(
        declared.has(name),
        `${demo.id}'s story '${story.id}' sets '${name}', and the dashboard's filters are `
          + Array.from(declared).join(', '),
      ).toBe(true);
      if (asText(value).includes('{')) continue;
      expect(
        asText(params[name]),
        `${demo.id}'s story '${story.id}' sets ${name} to ${asText(value)}, and its check '`
          + `${story.check}' was computed for ${asText(params[name])}`,
      ).toBe(asText(value));
    }
  }
  return stories;
}

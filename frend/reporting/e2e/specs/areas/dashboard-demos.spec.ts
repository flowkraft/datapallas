// ═══════════════════════════════════════════════════════════════════════════════
// dashboard-demos.spec.ts
// The Gallery, as a datapallas.com reader meets it (Phase B2, section 9.5).
//
// The page is `g-dashboard-demos`: 25 dashboards on one page, each of them a
// Canvas dashboard published as it was saved. It is the page datapallas.com
// frames, so this spec opens it the way that visitor does — through a share
// link, in a browser with no session at all. Everything it asserts is therefore
// also an assertion that the page works for somebody who was only sent a link.
//
// The link is made in `beforeAll` and taken back in `afterAll`, as
// `cube-stories.spec.ts` makes and revokes its own. Plain Playwright, no
// Electron and no sign-in, for the same reason that file uses it: a recipient
// has nothing but the URL, and a fixture that signed in would be testing
// something else.
//
// Nothing below states a demo, a widget, a filter or a number. The demos are
// the shipped index, the widgets are each dashboard's own canvas, the questions
// are its stories file and the values are
// `e2e/dashboard-demos/checks/<nn>-<id>.checks.json` — the same claims the Java
// loop holds the assembled dashboards to. The steps live in
// `helpers/dashboard-demos/` and `helpers/dashboard-demos-test-helper.ts`.
//
// Ids only: every control is reached by its id, and no selector reaches outside
// the card it belongs to (all 25 templates carry `#parameterBarContainer`).
//
// Written and checked, never run by this phase: the owner runs it.
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

const fs = require('fs');
const path = require('path');

import { Helpers } from '../../utils/helpers';
import { EXECUTABLE_DIR_PATH } from '../../utils/paths';
import {
  DEMOS,
  GALLERY_REPORT_ID,
  NOT_ON_THE_GALLERY,
  asQuery,
  declaredParams,
  demoOf,
  loadChecks,
  widgetOf,
} from '../../helpers/dashboard-demos/demo-catalog';
import {
  askData,
  assertClaims,
  asStanding,
  assertDemoDashboard,
  assertUniqueIds,
  cardOf,
  embedTokenOf,
  forgive,
  interactionOf,
  openPublished,
  prefixed,
  readParams,
  reloadDashboard,
  runInteractions,
  scrollCardIntoView,
  setParam,
  setParams,
  waitForChartsIn,
  watchForErrors,
  type ErrorWatch,
} from '../../helpers/dashboard-demos/published-dashboard-checks';
import {
  assertStoriesAreOffered,
  claimsOf,
  clickReset,
  clickShowMe,
  createGalleryShareLink,
  expectStoriesAndChecksAgree,
  reseedDashDemoData,
  revokeGalleryShareLinks,
  storiesOf,
  type AdminFetch,
} from '../../helpers/dashboard-demos-test-helper';

const BASE_URL = 'http://localhost:9090';

/** The demo the filter, link and story tests use: the one whose story picks a country. */
const DD02 = demoOf('dd-sales-overview');

/** Its neighbour on the page, which every isolation assertion is about. */
const DD03 = demoOf('dd-sales-by-country');

/**
 * Administrator calls — seeding, the share links — carry the installation key. Everything the page
 * itself does carries nothing but what its link put in it, which is the whole point of the file.
 */
const adminFetch: AdminFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

/** A share link for one report, for the tests about what a link opens. */
async function shareLinkFor(reportId: string, lockedParams?: Record<string, unknown>): Promise<string> {
  const created = await adminFetch(`${BASE_URL}/api/embed/share-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId, ...(lockedParams ? { lockedParams } : {}) }),
  });
  expect(created.status, `a share link for ${reportId}`).toBe(200);
  const made = await created.json();
  expect(made.token, 'the raw token is returned once, at creation').toBeTruthy();
  return made.token as string;
}

/**
 * A dashboard page a link does not open answers as a dead link does: 404 and "This link is no longer
 * available". Its reader holds a link, not an account, so there is no sign-in to send them to
 * (`SignInRedirectEntryPoint`); the API answers the same request with 401 or 403.
 */
async function expectDeadLink(request: APIRequestContext, url: string, what: string): Promise<void> {
  const answer = await request.get(url);
  expect(answer.status(), `${what} (${url})`).toBe(404);
  expect(await answer.text(), `${what}: the page says the link opens nothing`)
    .toContain('This link is no longer available');
}

/** And every link a test made is taken back, whatever the test did with it. */
async function revokeLinksFor(reportId: string): Promise<void> {
  const links = await adminFetch(
    `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(reportId)}`,
  ).then((r) => r.json());
  for (const link of links ?? [])
    await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
}

/** The Gallery's own address, with this link and whatever starting values a test wants. */
function galleryUrl(token: string, params: Record<string, unknown> = {}): string {
  const query = asQuery(params);
  return `${BASE_URL}/dashboard/${GALLERY_REPORT_ID}?token=${encodeURIComponent(token)}`
    + (query ? `&${query}` : '');
}

// One page, opened once per worker: 25 live dashboards are a heavy page, and every test asks the same
// page a different question, in the order a reader would. No test needs what an earlier one did - each
// demo puts its own card back and reads its neighbour before and after itself, the others open their
// own pages - so the file is not serial: a red test does not skip the ones after it, which run on a
// fresh worker that opens the page again.

test.describe('Dashboard Demos — the gallery of 25 dashboards', () => {
  let page: Page;
  let watch: ErrorWatch;
  let shareToken: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(30 * 60_000);

    // The data first: every check is a row of the demo data seeded for one fixed day, so the page
    // is asked to answer for that day whatever day the run happens on.
    await reseedDashDemoData(adminFetch, BASE_URL);

    shareToken = await createGalleryShareLink(adminFetch, BASE_URL);

    page = await browser.newPage();
    watch = watchForErrors(page);
    await page.goto(galleryUrl(shareToken), { timeout: 120_000, waitUntil: 'networkidle' });
  });

  test.afterAll(async () => {
    try {
      if (page) await page.close();
    } finally {
      await revokeGalleryShareLinks(adminFetch, BASE_URL);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. The page a visitor holding the link gets.
  // ────────────────────────────────────────────────────────────────────────────

  test('(dashboard demos gallery) the page holds the 25 demos the index lists', async () => {
    test.setTimeout(5 * 60_000);

    await expect(page.locator('.rb-dashboard-demos-root'), 'the Gallery opens for a visitor')
      .toBeVisible({ timeout: 60_000 });

    // The cards, in the index's order, each carrying its own dashboard and its own two links.
    const cardIds = await page.locator('.rb-dashboard-demos-root .card').evaluateAll((cards) =>
      cards.map((card) => card.id));
    expect(cardIds, 'one card per demo, in the order the index lists them')
      .toEqual(DEMOS.map((demo) => demo.id));

    for (const demo of DEMOS) {
      const card = cardOf(page, demo);
      await expect(card.locator(`rb-dashboard[report-id="${demo.reportId}"]`),
        `${demo.id}'s card carries its own dashboard`).toHaveCount(1);
      await expect(page.locator(`#lnkOpenAlone-${demo.id}`), `${demo.id} can be opened on its own`)
        .toHaveAttribute('href', `/dashboard/${demo.reportId}`);
      const built = page.locator(`#lnkHowBuilt-${demo.id}`);
      await expect(built, `${demo.id} says how it was built`)
        .toHaveAttribute('href', demo.howItWasBuiltUrl);
      await expect(built, 'and that page opens beside the Gallery, not over it')
        .toHaveAttribute('target', '_blank');
    }

    // And the contents list above them says the same thing, area by area.
    const contents = await page.locator('.rb-dashboard-demos-root nav a').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href')));
    for (const demo of DEMOS)
      expect(contents, `the contents list names ${demo.id}`).toContain(`#${demo.id}`);

    watch.assertNone('the Gallery on open');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. One test per demo, in the index's order: it loads, its filters work, and
  //    the questions it offers are answered by the numbers its checks hold it to.
  // ────────────────────────────────────────────────────────────────────────────

  for (const demo of DEMOS) {
    test(`(dashboard demos gallery) DD${String(demo.nn).padStart(2, '0')} ${demo.title}`
      + ' — loads, filters work, stories answer', async () => {
      test.setTimeout(20 * 60_000);

      const checks = loadChecks(demo.id);

      // 1. The card loads when it is scrolled to, and shows this demo's own numbers.
      const card = await scrollCardIntoView(page, demo);
      await assertDemoDashboard(card, demo, checks);

      // 2. Its filters do what they say, and put themselves back afterwards.
      await runInteractions(card, demo, checks);

      // 3. The questions it was written to answer, answered where the reader asked them.
      const stories = expectStoriesAndChecksAgree(demo.id);
      if (stories.length > 0) await assertStoriesAreOffered(card, demo);
      for (const story of stories) {
        const neighbour = DEMOS.find((other) => other.nn === demo.nn + 1) ?? null;
        // The card below loads when it is scrolled to: read it loaded, or "exactly as it was" below
        // would compare two empty bars.
        const before = neighbour ? await readParams(await scrollCardIntoView(page, neighbour), neighbour) : {};

        await clickShowMe(card, demo, story.id);

        // The values the story asked for stand in this dashboard's own filter bar, and the URL
        // holds the view - under this card's keys, so the link leads back to what was shown.
        const standing = await readParams(card, demo);
        for (const [name, value] of Object.entries(story.params ?? {})) {
          if (String(value).includes('{')) continue; // resolved by the server, not by the bar
          expect(standing[name], `${demo.id}: the story '${story.id}' set ${name}`)
            .toBe(asStanding(demo, name, value));
          expect(new URL(page.url()).searchParams.get(`${demo.reportId}.${name}`),
            `${demo.id}: the address bar holds the story that was shown`).toBe(String(value));
        }
        expect(new URL(page.url()).searchParams.get('token'),
          "the link's own token stays in the URL").toBe(shareToken);

        // And only this card's keys were written: the card below it is not in the address either.
        if (neighbour) {
          const theirs = Array.from(new URL(page.url()).searchParams.keys())
            .filter((key) => key.startsWith(`${neighbour.reportId}.`));
          expect(theirs, `${demo.id}'s story wrote none of ${neighbour.id}'s keys`).toEqual([]);
        }

        // And the numbers the story leads the reader to are the ones its check was computed for.
        const { params, kpis } = claimsOf(demo.id, story);
        await assertClaims(card, demo, params, kpis, `after Show Me on '${story.id}'`);

        // Its neighbour is untouched: a story is one dashboard's, not the page's (TODO 5j).
        if (neighbour)
          expect(await readParams(cardOf(page, neighbour), neighbour),
            `${demo.id}'s story left ${neighbour.id} exactly as it was`).toEqual(before);

        await clickReset(card, demo);
        await assertClaims(card, demo, checks.defaults, checks.kpis, 'after Reset');
      }

      await assertUniqueIds(card);
      watch.assertNone(`${demo.id} on the Gallery`);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. TODO 5g: the cards load as the reader reaches them.
  // ────────────────────────────────────────────────────────────────────────────

  test('(dashboard demos gallery) a card loads when it is reached, and not before', async ({ browser }) => {
    test.setTimeout(10 * 60_000);

    // A page of its own, watched from the first byte: what is being asserted is what a dashboard
    // far down the page has NOT asked for yet, and the page above has asked everything by now.
    const fresh = await browser.newPage();
    const asked: string[] = [];
    fresh.on('request', (request) => {
      const match = /\/api\/reports\/(g-d[^/]+)\/config/.exec(request.url());
      if (match) asked.push(match[1]);
    });
    try {
      await fresh.goto(galleryUrl(shareToken), { timeout: 120_000, waitUntil: 'networkidle' });
      const first = DEMOS[0];
      const last = DEMOS[DEMOS.length - 1];

      await expect.poll(() => asked.includes(first.reportId), { timeout: 60_000 })
        .toBe(true);
      expect(asked, `${last.id} is far below the fold, and has asked for nothing`)
        .not.toContain(last.reportId);

      await scrollCardIntoView(fresh, last);
      await expect.poll(() => asked.includes(last.reportId), { timeout: 120_000 }).toBe(true);
    } finally {
      await fresh.close();
    }
  });

  test('(dashboard demos gallery) a dashboard on its own page loads with no scrolling', async ({ browser }) => {
    test.setTimeout(5 * 60_000);

    // The other half of `lazy`: only the Gallery's cards carry it, so a dashboard opened on its own
    // is the page it always was.
    const own = await browser.newPage();
    // Opened with no link, a dashboard asks who is looking: this reader is signed in.
    await Helpers.signInBrowserContext(own.context());
    try {
      const body = await openPublished(own, DD02.reportId, {}, BASE_URL);
      await expect(own.locator(`rb-dashboard[lazy]`), 'its own page waits for nothing')
        .toHaveCount(0);
      await assertDemoDashboard(body, DD02);
    } finally {
      await own.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. TODO 5i: what the Gallery's credential opens, and what it refuses.
  // ────────────────────────────────────────────────────────────────────────────

  test('(dashboard demos gallery) the credential the page hands its cards opens those cards only', async () => {
    test.setTimeout(10 * 60_000);

    const card = await scrollCardIntoView(page, DD02);
    const token = await embedTokenOf(card);
    expect(token, 'the Gallery hands its cards a credential').toBeTruthy();

    // Positive: the card's own tiles answer with it, which is every card above having loaded.
    const widget = widgetOf(DD02.id, loadChecks(DD02.id).kpis[0].widget);
    const mine = await page.request.get(
      `${BASE_URL}/api/reports/${DD02.reportId}/data?componentId=${encodeURIComponent(widget.componentId)}`,
      { headers: { 'X-Embed-Token': token } },
    );
    expect(mine.status(), "a card reads its own dashboard's data").toBe(200);

    // Negative: a shipped, published dashboard that is on no card of this page.
    for (const asked of [
      `${BASE_URL}/api/reports/${NOT_ON_THE_GALLERY}/config`,
      `${BASE_URL}/api/reports/${NOT_ON_THE_GALLERY}/data?componentId=anything`,
    ]) {
      const refused = await page.request.get(asked, { headers: { 'X-Embed-Token': token } });
      expect([401, 403], `${asked} is not the Gallery's to open (${refused.status()})`)
        .toContain(refused.status());
    }

    // The link itself is no wider than the credential it hands out.
    const asked = `${BASE_URL}/api/reports/${NOT_ON_THE_GALLERY}/config?token=${encodeURIComponent(shareToken)}`;
    const refused = await page.request.get(asked);
    expect([401, 403], `${asked} is refused to the Gallery's link (${refused.status()})`)
      .toContain(refused.status());
    await expectDeadLink(page.request,
      `${BASE_URL}/dashboard/${NOT_ON_THE_GALLERY}?token=${encodeURIComponent(shareToken)}`,
      `${NOT_ON_THE_GALLERY} is not the Gallery link's to open`);
    forgive(watch, NOT_ON_THE_GALLERY);
  });

  test("(dashboard demos gallery) one demo's link opens that demo and nothing around it", async ({ browser }) => {
    test.setTimeout(10 * 60_000);

    const token = await shareLinkFor(DD02.reportId);
    const reader = await browser.newPage();
    const readerWatch = watchForErrors(reader);
    try {
      await reader.goto(`${BASE_URL}/dashboard/${DD02.reportId}?token=${encodeURIComponent(token)}`,
        { timeout: 120_000, waitUntil: 'networkidle' });
      await assertDemoDashboard(reader.locator('body'), DD02);

      // Not the Gallery it is a card of, and not the demo next to it.
      for (const reportId of [GALLERY_REPORT_ID, DD03.reportId])
        await expectDeadLink(reader.request,
          `${BASE_URL}/dashboard/${reportId}?token=${encodeURIComponent(token)}`,
          `${reportId} is not this link's to open`);

      // And asking under another name admits nothing: the credential says what it opens, the
      // request does not.
      const embed = await embedTokenOf(reader.locator('body'));
      const widened = await reader.request.get(
        `${BASE_URL}/api/reports/${DD03.reportId}/config`, { headers: { 'X-Embed-Token': embed } });
      expect([401, 403], `${DD03.id} is refused to ${DD02.id}'s credential (${widened.status()})`)
        .toContain(widened.status());

      // Nor does naming another report in the query widen the answer: what is read is the report in
      // the path, which is the one the credential was issued for.
      const widget = widgetOf(DD02.id, loadChecks(DD02.id).kpis[0].widget);
      const plainly = `${BASE_URL}/api/reports/${DD02.reportId}/data`
        + `?componentId=${encodeURIComponent(widget.componentId)}`;
      const asked = await reader.request.get(plainly, { headers: { 'X-Embed-Token': embed } });
      const louder = await reader.request.get(
        `${plainly}&reportId=${encodeURIComponent(NOT_ON_THE_GALLERY)}`,
        { headers: { 'X-Embed-Token': embed } },
      );
      expect(louder.status(), 'the report in the query is not the report that answers')
        .toBe(asked.status());
      // The same answer, apart from how long the server took to give it.
      const answerOf = async (response: APIResponse): Promise<Record<string, unknown>> => {
        const { executionTimeMillis: _took, ...answer } = await response.json();
        return answer;
      };
      expect(await answerOf(louder), 'and the answer is the same one').toEqual(await answerOf(asked));

      // The same, from inside the page: a dashboard added to the DOM by hand is still refused.
      const added = await reader.evaluate(async (reportId) => {
        const host = document.createElement('rb-dashboard');
        host.setAttribute('report-id', reportId);
        host.setAttribute('api-base-url', '/api');
        const mine = document.querySelector('rb-dashboard');
        host.setAttribute('embed-token', mine?.getAttribute('embed-token') ?? '');
        document.body.appendChild(host);
        const answer = await fetch(`/api/reports/${reportId}/config`, {
          headers: { 'X-Embed-Token': host.getAttribute('embed-token') ?? '' },
        });
        return answer.status;
      }, NOT_ON_THE_GALLERY);
      expect([401, 403], `a dashboard added to the page admits nothing (${added})`).toContain(added);

      forgive(readerWatch, GALLERY_REPORT_ID, DD03.reportId, NOT_ON_THE_GALLERY);
      readerWatch.assertNone(`${DD02.id} on its own link`);
    } finally {
      await reader.close();
      await revokeLinksFor(DD02.reportId);
    }
  });

  test('(dashboard demos gallery) the Gallery may be framed and a demo on its own may not', async () => {
    // The Gallery is the page datapallas.com frames, exactly as Cube Stories is; a dashboard on its
    // own page is not, and says so in the header a browser enforces.
    const gallery = await page.request.get(
      `${BASE_URL}/dashboard/${GALLERY_REPORT_ID}?token=${encodeURIComponent(shareToken)}`);
    expect(gallery.status(), 'the Gallery opens').toBe(200);
    const frameable = gallery.headers()['content-security-policy'] ?? '';
    expect(frameable, 'and it says who may frame it').toContain('frame-ancestors');
    expect((gallery.headers()['x-frame-options'] ?? '').toUpperCase(),
      'so it is not flatly refused to every frame').not.toBe('DENY');

    const alone = await page.request.get(`${BASE_URL}/dashboard/${DD02.reportId}`);
    expect((alone.headers()['x-frame-options'] ?? '').toUpperCase(),
      'a demo on its own page is nobody\'s to frame').toBe('DENY');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. TODO 5j's negative half: stories belong to the card that offers them.
  // ────────────────────────────────────────────────────────────────────────────

  test('(dashboard demos gallery) a demo on its own page shows no stories', async ({ browser }) => {
    test.setTimeout(5 * 60_000);

    // `show-stories` is the Gallery's attribute: on its own page the dashboard is the dashboard,
    // and the questions belong to the page that offers them.
    const own = await browser.newPage();
    // Opened with no link, a dashboard asks who is looking: this reader is signed in.
    await Helpers.signInBrowserContext(own.context());
    try {
      const body = await openPublished(own, DD02.reportId, {}, BASE_URL);
      expect(storiesOf(DD02.id).length, `${DD02.id} ships stories`).toBeGreaterThan(0);
      await expect(body.locator(`#stories-${DD02.reportId}`), 'and its own page offers none')
        .toHaveCount(0);
    } finally {
      await own.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. TODO 5f: the values a link carries, and the ones it writes back.
  // ────────────────────────────────────────────────────────────────────────────

  test("(dashboard demos gallery) a link carries a dashboard's starting values", async ({ browser }) => {
    test.setTimeout(10 * 60_000);

    const interaction = interactionOf(loadChecks(DD02.id), storiesOf(DD02.id)[0].check);
    const picked: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(interaction.changed))
      if (declaredParams(DD02.id).some((p) => p.id === name)) picked[name] = value;

    // On its own page, the plain names.
    const own = await browser.newPage();
    // Opened with no link, a dashboard asks who is looking: this reader is signed in.
    await Helpers.signInBrowserContext(own.context());
    try {
      const body = await openPublished(own, DD02.reportId, picked, BASE_URL);
      const standing = await readParams(body, DD02);
      for (const [name, value] of Object.entries(picked))
        expect(standing[name], `${name} started at the value the link carried`).toBe(asStanding(DD02, name, value));
      await assertClaims(body, DD02, interaction.params, interaction.kpis, 'as the link opened it');
    } finally {
      await own.close();
    }

    // On the Gallery, the same values under this card's keys - and nobody else's card moves.
    const gallery = await browser.newPage();
    try {
      await gallery.goto(galleryUrl(shareToken, prefixed(DD02, picked)),
        { timeout: 120_000, waitUntil: 'networkidle' });
      const card = await scrollCardIntoView(gallery, DD02);
      const standing = await readParams(card, DD02);
      for (const [name, value] of Object.entries(picked))
        expect(standing[name], `${DD02.id} started at ${name}=${value}`).toBe(asStanding(DD02, name, value));

      const neighbour = await scrollCardIntoView(gallery, DD03);
      const theirs = await readParams(neighbour, DD03);
      const defaults = loadChecks(DD03.id).defaults;
      for (const [name, value] of Object.entries(defaults))
        if (name in theirs && !String(value).includes('{'))
          expect(theirs[name], `${DD03.id} is at its own default for ${name}`).toBe(asStanding(DD03, name, value));
    } finally {
      await gallery.close();
    }
  });

  test('(dashboard demos gallery) a plain name on the Gallery belongs to nobody', async ({ browser }) => {
    test.setTimeout(5 * 60_000);

    // A plain filter name is read only on a dashboard's own page. On a page of 25, it would be 25
    // dashboards reading one value, so it is read by none of them.
    const interaction = interactionOf(loadChecks(DD02.id), storiesOf(DD02.id)[0].check);
    const [name, value] = Object.entries(interaction.changed)
      .find(([id]) => declaredParams(DD02.id).some((p) => p.id === id)) as [string, unknown];

    const gallery = await browser.newPage();
    try {
      await gallery.goto(galleryUrl(shareToken, { [name]: value }),
        { timeout: 120_000, waitUntil: 'networkidle' });
      const card = await scrollCardIntoView(gallery, DD02);
      const standing = await readParams(card, DD02);
      const defaults = loadChecks(DD02.id).defaults;
      if (!String(defaults[name] ?? '').includes('{'))
        expect(standing[name], `${DD02.id} stayed at its own default for ${name}`)
          .toBe(asStanding(DD02, name, defaults[name] ?? ''));
      await assertClaims(card, DD02, defaults, loadChecks(DD02.id).kpis, 'with a plain name in the URL');
    } finally {
      await gallery.close();
    }
  });

  test('(dashboard demos gallery) a lock beats what the link is opened with', async ({ browser }) => {
    test.setTimeout(10 * 60_000);

    const checks = loadChecks(DD02.id);
    const interaction = interactionOf(checks, storiesOf(DD02.id)[0].check);
    const [name, locked] = Object.entries(interaction.changed)
      .find(([id]) => declaredParams(DD02.id).some((p) => p.id === id)) as [string, unknown];

    const token = await shareLinkFor(DD02.reportId, { [name]: locked });
    const reader = await browser.newPage();
    try {
      // Opened asking for something else entirely: the default, which is not what is locked.
      await reader.goto(
        `${BASE_URL}/dashboard/${DD02.reportId}?token=${encodeURIComponent(token)}`
          + `&${encodeURIComponent(name)}=${encodeURIComponent(String(checks.defaults[name] ?? ''))}`,
        { timeout: 120_000, waitUntil: 'networkidle' },
      );
      const body = reader.locator('body');
      await expect(body.locator(`#${name}`), 'a locked filter is not the reader\'s to change')
        .toBeDisabled({ timeout: 60_000 });
      expect((await readParams(body, DD02))[name], "the bar is on the link's value")
        .toBe(asStanding(DD02, name, locked));

      // And the data is the locked answer, whatever the address asked for: the server's LockedParams.
      await assertClaims(body, DD02, interaction.params, interaction.kpis, 'under its lock');

      // Never written back either: another filter changed leaves the locked name out of the URL.
      const other = declaredParams(DD02.id).find((p) => p.id !== name);
      if (other) {
        const value = interaction.changed[other.id] ?? checks.defaults[other.id];
        if (value !== undefined && !String(value).includes('{')) {
          await setParam(body, other, value);
          await reloadDashboard(body);
          expect(new URL(reader.url()).searchParams.get(name),
            'a locked filter is never written to the address bar').toBeNull();
        }
      }
    } finally {
      await reader.close();
      await revokeLinksFor(DD02.reportId);
    }
  });

  test('(dashboard demos gallery) a value out of a URL is never script, and never silently wrong',
    async ({ browser }) => {
      test.setTimeout(10 * 60_000);

      const checks = loadChecks(DD02.id);
      const name = (declaredParams(DD02.id)[0] as { id: string }).id;
      const reader = await browser.newPage();
      // Opened with no link, a dashboard asks who is looking: this reader is signed in.
      await Helpers.signInBrowserContext(reader.context());
      // A dialog is a failure: a value that became script would open one. `watchForErrors` records
      // dialogs and dismisses them, so the assertion below is that none was opened.
      const readerWatch = watchForErrors(reader);
      try {
        await reader.goto(
          `${BASE_URL}/dashboard/${DD02.reportId}`
            + `?${encodeURIComponent(name)}=${encodeURIComponent('<script>alert(1)</script>')}`
            + '&notAFilterOfThisDashboard=whatever',
          { timeout: 120_000, waitUntil: 'networkidle' },
        );
        const body = reader.locator('body');
        await expect(body.locator('rb-dashboard'), 'the dashboard still opens')
          .toBeVisible({ timeout: 60_000 });
        await expect(body.locator('script#xss'), 'and nothing from the URL became script')
          .toHaveCount(0);
        expect(await reader.evaluate(() => (window as any).xssRan ?? false),
          'nothing out of the URL ran').toBe(false);

        // The unknown key changed nothing, and the dashboard is on its own defaults.
        await assertClaims(body, DD02, checks.defaults, checks.kpis, 'with a URL it did not accept');

        // A console warning per ignored key is the component saying so, and is not an error.
        const warnings = readerWatch.messages.filter((one) => one.startsWith('console:'));
        expect(warnings, 'an ignored key is a warning, not an error').toEqual([]);

        // The other half of "ignored": a value the filter does not offer. The select's options are
        // the countries the data has, so a name that is not one of them is not accepted either.
        const select = declaredParams(DD02.id)
          .find((p) => String(p.uiHints?.control ?? '') === 'select');
        expect(select, `${DD02.id} has a select to offer a value it does not have`).toBeTruthy();
        const picky = (select as { id: string }).id;
        await reader.goto(
          `${BASE_URL}/dashboard/${DD02.reportId}`
            + `?${encodeURIComponent(picky)}=NotACountryThisDataHas`,
          { timeout: 120_000, waitUntil: 'networkidle' },
        );
        expect((await readParams(reader.locator('body'), DD02))[picky],
          `${picky} stayed at its own default`).toBe(asStanding(DD02, picky, checks.defaults[picky] ?? ''));
        await assertClaims(reader.locator('body'), DD02, checks.defaults, checks.kpis,
          'with a value its filter does not offer');

        readerWatch.assertNone('a dashboard opened with a URL it refuses');
      } finally {
        await reader.close();
      }
    });

  test('(dashboard demos gallery) picking a filter writes the view into the address bar',
    async ({ browser }) => {
      test.setTimeout(10 * 60_000);

      const checks = loadChecks(DD02.id);
      const interaction = interactionOf(checks, storiesOf(DD02.id)[0].check);
      const param = declaredParams(DD02.id).find((p) => p.id in interaction.changed);
      expect(param, `${DD02.id}'s story picks a filter it declares`).toBeTruthy();
      const name = (param as { id: string }).id;
      const value = interaction.changed[name];

      // The reader's own browser, so a second page of it (below) is the same signed-in reader.
      const context = await browser.newContext();
      const reader = await context.newPage();
      // Opened with no link, a dashboard asks who is looking: this reader is signed in.
      await Helpers.signInBrowserContext(context);
      try {
        const body = await openPublished(reader, DD02.reportId, {}, BASE_URL);
        const historyBefore = await reader.evaluate(() => history.length);

        await setParam(body, param as any, value);
        await reloadDashboard(body);
        await waitForChartsIn(body);

        expect(new URL(reader.url()).searchParams.get(name), 'the address bar holds what was picked')
          .toBe(String(value));
        expect(await reader.evaluate(() => history.length),
          'and holding it is not a new page in the reader\'s history').toBe(historyBefore);

        // A fresh page on that address is the same view: the link is the view.
        const again = await context.newPage();
        try {
          await again.goto(reader.url(), { timeout: 120_000, waitUntil: 'networkidle' });
          const there = again.locator('body');
          expect((await readParams(there, DD02))[name], 'opened again, on the same value')
            .toBe(asStanding(DD02, name, value));
          await assertClaims(there, DD02, interaction.params, interaction.kpis, 'opened from its link');
        } finally {
          await again.close();
        }

        // And back to the default takes the key away again.
        const back = checks.defaults[name];
        if (back !== undefined && !String(back).includes('{')) {
          await setParam(body, param as any, back);
          await reloadDashboard(body);
          expect(new URL(reader.url()).searchParams.get(name),
            'a filter back at its default leaves the address as it was').toBeNull();
        }
      } finally {
        await context.close();
      }
    });

  test('(dashboard demos gallery) a picked option that holds a comma reads back as one option',
    async ({ browser }) => {
      test.setTimeout(15 * 60_000);

      // No option of any demo holds a comma - the demo data has none in a name anywhere - so the
      // case is made: a copy of one demo, published beside it under a throwaway report id, whose
      // multiselect offers a list with a comma inside one of its values. The copy is a published
      // dashboard like any other (`config/samples/<id>` and the template the packaging moved), and
      // it is removed in `finally`, whatever the test did.
      const source = demoOf('dd-sales-overview');
      const param = declaredParams(source.id)
        .find((p) => String(p.uiHints?.control ?? '') === 'multiselect');
      expect(param, `${source.id} has a multiselect to make the case with`).toBeTruthy();
      const name = (param as { id: string }).id;

      const copyId = 'g-dd-e2e-comma';
      const withComma = 'Cables, Power';
      const plain = 'Video';

      const samples = path.join(EXECUTABLE_DIR_PATH, 'config', 'samples');
      const templates = path.join(EXECUTABLE_DIR_PATH, 'samples', 'reports', 'dashboard-demos');
      const from = path.join(samples, source.reportId);
      const into = path.join(samples, copyId);
      const template = path.join(templates, `${copyId}-template.html`);

      try {
        expect(fs.existsSync(from), `${from} is the published dashboard to copy`).toBe(true);
        fs.cpSync(from, into, { recursive: true });

        // Everything in the copy is about the copy: the file names the server looks for are built
        // from the report id, and so are the ids inside them.
        for (const file of fs.readdirSync(into)) {
          const there = path.join(into, file);
          fs.writeFileSync(there, fs.readFileSync(there, 'utf8').split(source.reportId).join(copyId));
          if (file.includes(source.reportId))
            fs.renameSync(there, path.join(into, file.split(source.reportId).join(copyId)));
        }
        // Its page, where the packaging moved the demos' templates and its own `reporting.xml` now
        // points.
        fs.writeFileSync(
          template,
          fs.readFileSync(path.join(templates, `${source.reportId}-template.html`), 'utf8')
            .split(source.reportId).join(copyId),
        );

        // The one difference from the demo it copies: the filter offers three fixed values, and one
        // of them holds a comma - the character a URL joins several picked values with.
        const spec = path.join(into, `${copyId}-report-parameters-spec.groovy`);
        const lines = fs.readFileSync(spec, 'utf8').split('\n');
        const declared = lines.findIndex((line: string) => line.includes(`id: '${name}'`));
        expect(declared, `the copied spec declares ${name}`).toBeGreaterThanOrEqual(0);
        const offers = lines.findIndex((line: string, i: number) =>
          i > declared && line.includes('options:'));
        expect(offers, `${name} offers options to replace`).toBeGreaterThan(declared);
        // A double-quoted Groovy string, so the SQL can hold the single quotes the values need.
        lines[offers] = `    ui(control: 'multiselect', options: "SELECT '${withComma}' AS value,`
          + ` '${withComma}' AS label UNION ALL SELECT '${plain}', '${plain}'`
          + ` UNION ALL SELECT 'Displays', 'Displays'")`;
        fs.writeFileSync(spec, lines.join('\n'));

        const reader = await browser.newPage();
        // Opened with no link, a dashboard asks who is looking: this reader is signed in.
        await Helpers.signInBrowserContext(reader.context());
        try {
          await reader.goto(`${BASE_URL}/dashboard/${copyId}`,
            { timeout: 120_000, waitUntil: 'networkidle' });
          await expect(reader.locator('rb-dashboard'), 'the copy is published and opens')
            .toBeVisible({ timeout: 60_000 });

          const body = reader.locator('body');
          await setParam(body, param as any, [withComma, plain]);
          await reloadDashboard(body);

          // Written escaped, which is what keeps two picked values from reading back as three.
          const written = new URL(reader.url()).searchParams.get(name) ?? '';
          expect(written, 'the comma inside a value is escaped where the values are joined')
            .toContain('\\,');

          // And opened again from that address, the same two are ticked - not three.
          await reader.goto(reader.url(), { timeout: 120_000, waitUntil: 'networkidle' });
          await body.locator(`#${name}`).click();
          await expect(body.locator(`#${name}_modal`), `${name} opens its list`)
            .toBeVisible({ timeout: 30_000 });
          const ticked = await body.locator(`#${name}_modal`).evaluate((modal) =>
            Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'))
              .map((box) => (box as HTMLInputElement).value));
          expect(ticked.slice().sort(), 'the same two options, opened again from the link')
            .toEqual([withComma, plain].slice().sort());
        } finally {
          await reader.close();
        }
      } finally {
        fs.rmSync(into, { recursive: true, force: true });
        fs.rmSync(template, { force: true });
      }
    });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. One page, 25 dashboards, no crosstalk: the last word on isolation.
  // ────────────────────────────────────────────────────────────────────────────

  test('(dashboard demos gallery) a reload in one card leaves the others where they were', async () => {
    test.setTimeout(10 * 60_000);

    const mine = await scrollCardIntoView(page, DD02);
    const theirs = await scrollCardIntoView(page, DD03);
    const before = await readParams(theirs, DD03);
    const theirChecks = loadChecks(DD03.id);

    const interaction = interactionOf(loadChecks(DD02.id), storiesOf(DD02.id)[0].check);
    await setParams(mine, DD02, interaction.changed);
    await reloadDashboard(mine);
    await waitForChartsIn(mine);

    expect(await readParams(theirs, DD03), `${DD03.id}'s filter bar did not move`).toEqual(before);
    await assertClaims(theirs, DD03, theirChecks.defaults, theirChecks.kpis,
      'while the card above it was reloaded');

    // The data call each card makes is its own, and so is the answer.
    const mineWidget = widgetOf(DD02.id, loadChecks(DD02.id).kpis[0].widget);
    const theirWidget = widgetOf(DD03.id, theirChecks.kpis[0].widget);
    await askData(mine, DD02, mineWidget, interaction.params);
    await askData(theirs, DD03, theirWidget, theirChecks.defaults);

    await setParams(mine, DD02, loadChecks(DD02.id).defaults);
    await reloadDashboard(mine);
    watch.assertNone('the Gallery after one card was reloaded');
  });
});

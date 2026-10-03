// ═══════════════════════════════════════════════════════════════════════════════
// dashboard-demos.public.ts
// The Gallery on the real site (Phase D, TODO 14a).
//
// `dashboard-demos.spec.ts` opens the Gallery straight on a local server. This one opens it the way a
// reader of datapallas.com does: the docs page at /docs/dashboard-demos, with the Gallery inside its
// iframe, served by demo.datapallas.com. That is the one thing the local spec cannot prove - that a browser
// really lets the site frame the page (the deployed `frame-ancestors`, no `X-Frame-Options` on the
// Gallery) through the share link the docs page holds, and that the 25 "How was this dashboard built?"
// links lead to pages that exist.
//
// Everything inside the iframe is the same helper, on the iframe's Frame: the first card drawn, one story
// shown and reset, the last card loaded when it is scrolled to.
//
// What it does NOT check is a number. The demo data is seeded when the installation is made and its dates
// move in whole 52-week steps to the day it was seeded, so the numbers in `e2e/dashboard-demos/checks` are
// the local run's, for the day it re-seeds for - which is what the local spec does and what nothing may do to
// a public installation. Here the claim is that every tile of the first card has drawn real content, that
// a story changes the filters it says it changes and Reset puts them back, and that the card far down the
// page asks for nothing until it is reached. The numbers are the local spec's claim.
//
// It makes no share link and needs no sign-in: it uses the link the published page holds. Its name does
// not match the default `**/*.spec.ts`, so no CI run picks it up - the owner runs it after deploying
// demo.datapallas.com and the site, with `E2E_SPEC='dashboard-demos\.public'`.
//
// Written and checked, never run here (TODO 14a of D-how-built-pages.md).
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, type Frame } from '@playwright/test';

import { DEMOS, pad } from '../../helpers/dashboard-demos/demo-catalog';
import { assertDemoDrawn, assertUniqueIds, readParams } from '../../helpers/dashboard-demos/published-dashboard-checks';
import {
  assertStoriesAreOffered,
  clickReset,
  clickShowMe,
  storiesOf,
} from '../../helpers/dashboard-demos-test-helper';

/** Fixed in the file, as every other address in this spec is: there is one public site. */
const DOCS_PAGE = 'https://datapallas.com/docs/dashboard-demos';
const DEMO_ORIGIN = 'https://demo.datapallas.com';
const GALLERY_PATH = '/dashboard/g-dashboard-demos';
const IFRAME = 'iframe[title="Dashboard Demos"]';

/** A story whose filters are plain values: what the filter bar must then say, with no date to resolve. */
const plainStory = (demoId: string) =>
  storiesOf(demoId).find((one) => {
    const values = Object.values(one.params ?? {});
    return values.length > 0 && values.every((value) => !String(value).includes('{'));
  });

test.describe('Dashboard Demos on datapallas.com', () => {

  test('(dashboard demos public) the site frames the Gallery, a card is drawn, a story is shown and reset,'
    + ' and the last card loads when reached', async ({ page }) => {
    test.setTimeout(30 * 60_000);

    // Watched from the first byte: what is asserted about the last card is what it has NOT asked for yet.
    const asked: string[] = [];
    page.on('request', (request) => {
      const match = /\/api\/reports\/(g-dd-[^/]+)\/config/.exec(request.url());
      if (match) asked.push(match[1]);
    });

    await page.goto(DOCS_PAGE, { waitUntil: 'domcontentloaded' });

    // ── The frame itself: the one claim only the real site can make ─────────
    const iframe = page.locator(IFRAME);
    await expect(iframe, 'the docs page shows the Gallery').toBeVisible({ timeout: 60_000 });

    const source = (await iframe.getAttribute('src')) ?? '';
    expect(source, 'it is the demo installation that is framed').toContain(DEMO_ORIGIN);
    expect(source, 'and the Gallery').toContain(GALLERY_PATH);
    expect(source, 'through a share link, so the reader needs no account').toContain('token=');

    // A browser that refused the frame leaves an element with nothing in it, so the frame is not
    // asserted by its tag but by what is inside it.
    const inside = page.frameLocator(IFRAME);
    await expect(inside.locator('.rb-dashboard-demos-root'),
      'the browser let the site frame the page').toBeVisible({ timeout: 90_000 });

    const frame = page.frames().find((one) => one.url().includes(GALLERY_PATH)) as Frame;
    expect(frame, 'the framed page is a frame of this page').toBeTruthy();

    // ── The page inside it, card for card ───────────────────────────────────
    const cardIds = await frame.locator('.rb-dashboard-demos-root .card')
      .evaluateAll((cards) => cards.map((card) => card.id));
    expect(cardIds, 'one card per demo, in the index\'s order').toEqual(DEMOS.map((demo) => demo.id));
    for (const demo of DEMOS) {
      const built = frame.locator(`#lnkHowBuilt-${demo.id}`);
      await expect(built, `${demo.id} says how it was built, on the site`).toHaveAttribute('href', demo.howItWasBuiltUrl);
      await expect(built, 'in a new tab, beside the Gallery').toHaveAttribute('target', '_blank');
    }

    // ── Lazy, negative half: the card far down the page has asked for nothing ──
    const first = DEMOS[0];
    const last = DEMOS[DEMOS.length - 1];
    await expect.poll(() => asked.includes(first.reportId), { timeout: 60_000 },
    ).toBe(true);
    expect(asked, `${last.id} is far below the fold, and has asked for nothing`).not.toContain(last.reportId);

    // ── The first card: every tile it has has drawn something ───────────────
    const firstCard = frame.locator(`#${first.id}`);
    await firstCard.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await assertDemoDrawn(firstCard, first);
    await assertUniqueIds(firstCard);

    // ── A story: Show Me changes the filters it says it changes, Reset puts them back ──
    const withStory = DEMOS.find((demo) => plainStory(demo.id));
    expect(withStory, 'at least one demo ships a story with plain filter values').toBeTruthy();
    const demo = withStory!;
    const story = plainStory(demo.id)!;
    const card = frame.locator(`#${demo.id}`);
    await card.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await assertDemoDrawn(card, demo);
    await assertStoriesAreOffered(card, demo);

    const before = await readParams(card, demo);
    await clickShowMe(card, demo, story.id);
    const standing = await readParams(card, demo);
    for (const [name, value] of Object.entries(story.params)) {
      expect(standing[name], `${demo.id}: Show Me on '${story.id}' sets ${name}`).toBe(String(value));
    }
    expect(
      Object.keys(story.params).some((name) => before[name] !== standing[name]),
      `${demo.id}: Show Me changed a filter, and did not just leave the dashboard as it was`,
    ).toBe(true);

    await clickReset(card, demo);
    expect(await readParams(card, demo), `${demo.id}: Reset puts every filter back`).toEqual(before);

    // ── Lazy, positive half: scrolled to, the last card loads and draws ─────
    const lastCard = frame.locator(`#${last.id}`);
    await lastCard.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect.poll(() => asked.includes(last.reportId), { timeout: 120_000 }).toBe(true);
    await assertDemoDrawn(lastCard, last);
  });

  test('(dashboard demos public) every "How was this dashboard built?" link opens a page that exists',
    async ({ request }) => {
      test.setTimeout(10 * 60_000);

      for (const demo of DEMOS) {
        const answer = await request.get(demo.howItWasBuiltUrl);
        expect(answer.status(), `${demo.howItWasBuiltUrl} is a page of the site`).toBe(200);
        // The page names its demo, so a catch-all that answers 200 for everything does not pass.
        expect(await answer.text(), `${demo.id}'s page is DD${pad(demo.nn)}'s`).toContain(`DD${pad(demo.nn)}`);
      }

      const missing = await request.get(`${DOCS_PAGE}/dd-no-such-demo`);
      expect(missing.status(), 'and a demo that does not exist has no page').toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cube-stories.public.ts
// The same page, on the real site (Phase 3c, design part 8).
//
// `cube-stories.spec.ts` opens the Cube Stories dashboard straight on a local
// server. This one opens it the way a reader of datapallas.com does: the docs
// page at /docs/semantic-layer/cube-stories, with the dashboard inside its
// iframe, served by demo.datapallas.com. That is the one thing the local spec
// cannot prove — that a browser really lets the site frame the page, which
// takes the deployed `Content-Security-Policy: frame-ancestors`, the missing
// `X-Frame-Options`, and the share link the docs page holds.
//
// Everything inside the iframe is the same helper, on the iframe's Frame: the
// page's cards, and every hint of every card clicked and answered.
//
// What it does NOT check is the rows. The demo data is seeded when the
// installation is made and its dates are moved to the day it was seeded, so
// the checks in `_resources/cube-checks` are true of a run that re-seeds for
// the day they were computed for — which is what the local spec does and what
// nothing may do to a public installation. Here the claim is that every hint
// is offered, fills the tree it says it fills and is answered; the rows those
// answers hold are the local spec's claim.
//
// It makes no share link and needs no sign-in: it uses the link the published
// page holds. Its name does not match the default `**/*.spec.ts`, so no CI run
// picks it up — the owner runs it after deploying demo.datapallas.com and the
// site, with `E2E_SPEC='cube-stories\.public'`.
//
// Written and checked, never run here (TODO 14 of
// 03c-phase-3c-cube-stories-docs-e2e.md).
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, type Frame } from '@playwright/test';

import {
  CUBE_STORIES_CARDS,
  asksOf,
  clickShowMe,
  drawnRows,
  expectNoCardWarns,
  expectTheWholePage,
  expectTreeShows,
  inCard,
  waitForCard,
} from '../../helpers/cube-stories-test-helper';

/** Fixed in the file, as every other address in this spec is: there is one public site. */
const DOCS_PAGE = 'https://datapallas.com/docs/semantic-layer/cube-stories';
const DEMO_ORIGIN = 'https://demo.datapallas.com';

test.describe('Cube Stories on datapallas.com', () => {

  test('(cube-stories public) the site frames the demo, and every hint answers in it', async ({ page }) => {
    test.setTimeout(45 * 60_000);

    await page.goto(DOCS_PAGE, { waitUntil: 'domcontentloaded' });

    // ── The frame itself: the one claim only the real site can make ─────────
    const iframe = page.locator('iframe[title="Cube Stories"]');
    await expect(iframe, 'the docs page shows the dashboard').toBeVisible({ timeout: 60_000 });

    const source = (await iframe.getAttribute('src')) ?? '';
    expect(source, 'it is the demo installation that is framed').toContain(DEMO_ORIGIN);
    expect(source, 'and the Cube Stories dashboard').toContain('/dashboard/g-cube-stories');
    expect(source, 'through a share link, so the reader needs no account').toContain('token=');

    // A browser that refused the frame leaves an element with nothing in it, so the frame is not
    // asserted by its tag but by what is inside it.
    const inside = page.frameLocator('iframe[title="Cube Stories"]');
    await expect(inside.locator('.rb-cube-stories-root'),
      'the browser let the site frame the page').toBeVisible({ timeout: 90_000 });

    const frame = page.frames().find((one) => one.url().includes('/dashboard/g-cube-stories')) as Frame;
    expect(frame, 'the framed page is a frame of this page').toBeTruthy();

    // ── The page inside it, card for card ───────────────────────────────────
    await expectTheWholePage(frame);

    // ── Every hint of every card: offered, clicked, and answered ────────────
    for (const card of CUBE_STORIES_CARDS) {
      await waitForCard(frame, card.id, 120_000);
      const asks = asksOf(card);

      await expect(inCard(frame, card.id, '#cubeHints .rb-hint')).toHaveCount(asks.length, { timeout: 30_000 });
      for (const ask of asks) {
        await expect(inCard(frame, card.id, `#hint-${ask.id}`)).toContainText(ask.question);
      }

      for (const ask of asks) {
        const answered = await clickShowMe(frame, card.id, ask.id);
        await expectTreeShows(frame, card.id, ask.query);
        // Answered, not merely asked: a deployment whose demo data never loaded would draw an
        // empty table for every hint and every other assertion here would still pass.
        expect(answered.length, `${card.id} / ${ask.id}: the hint is answered with rows`).toBeGreaterThan(0);
        expect((await drawnRows(frame, card.id)).length).toBe(answered.length);
      }
    }

    // The cubes the site is showing off parse clean on the deployment too.
    await expectNoCardWarns(frame);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// visual-review.screens.ts
// Pictures of everything the public pages show, to be looked at (not asserted).
//
// datapallas.com frames two dashboards: the Gallery (`g-dashboard-demos`, 25 cards)
// and Cube Stories (`g-cube-stories`, 16 cards). This file takes, for each of them
// and for each of the 25 dashboards a Gallery card opens on its own page, one MAIN
// picture: the whole item inside the viewport, after everything in it has drawn,
// in the theme the installation ships (`config/_internal/settings.xml`, dark), which
// is the one a reader of the public pages sees.
//
// Then the DETAILS: on a dashboard's own page each tile, each chart's tooltip, the
// page at 390 px and in print, and the page and its tiles in the light theme; on a
// Gallery card each story's Show Me and the Reset; on a cube card every other hint.
//
// It never asserts and never stops at a broken page: what went wrong (an error the
// page logged, a tile still asking, an item taller than the viewport) is written
// next to the picture, and the next item is taken. Everything lands under
// `<outputDir>/visual-review/`: `main/<item>.png`, `<item>/<nn>-<what>-<theme>.png`,
// and one `meta/<item>.json` per item (the pictures it meant to take, the notes,
// the page's errors).
//
// One test per item, titled `(visual) DD<nn> <id>`, `(visual) gallery DD<nn> <id>`
// or `(visual) cube <id>`, so a run can re-take a few items by E2E_GREP; the same
// `DD<nn>` also matches that demo's tests in the dashboard-demos specs.
//
// Its name does not match `**/*.spec.ts`, so no ordinary run picks it up. Run it
// alone with E2E_SPEC='visual-review\.screens\.ts$' (plan
// plan-fix-issues-seen-visually-in-all-cubes-stories-dash-demos.md, TODOs 2, 2b, 3).
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';

import { test, type Frame, type Locator, type Page } from '@playwright/test';

import { Helpers } from '../../utils/helpers';
import {
  DEMOS,
  GALLERY_REPORT_ID,
  pad,
  shownReportId,
  type Demo,
} from '../../helpers/dashboard-demos/demo-catalog';
import { waitForChartsIn, watchForErrors, type ErrorWatch } from '../../helpers/dashboard-demos/published-dashboard-checks';
import {
  clickReset,
  clickShowMe,
  createGalleryShareLink,
  reseedDashDemoData,
  revokeGalleryShareLinks,
  storiesOf,
  type AdminFetch,
} from '../../helpers/dashboard-demos-test-helper';
import {
  CUBE_STORIES_PAGE_CARDS,
  CUBE_STORIES_REPORT_ID,
  asksOf,
  cardOf as cubeCardOf,
  cardRoot,
  clickShowMe as cubeShowMe,
  createCubeStoriesShareLink,
  reseedCubeDemoData,
  revokeCubeStoriesShareLinks,
  waitForCard,
} from '../../helpers/cube-stories-test-helper';

const BASE_URL = 'http://localhost:9090';

/** How wide every picture is: a laptop screen, wide enough for a dashboard's grid. */
const WIDTH = 1400;

/** Room left around an item, so its edges are seen to be its edges. */
const MARGIN = 24;

/** Taller than this, a picture is no longer one a person reads; the item is noted as too tall. */
const MAX_HEIGHT = 12_000;

/** Administrator calls (seeding, share links) carry the installation key, as the two specs' do. */
const adminFetch: AdminFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

// ── Where the pictures go ─────────────────────────────────────────────────────

function outDir(): string {
  return path.join(test.info().project.outputDir, 'visual-review');
}

function shotPath(item: string, name: string): string {
  const file = path.join(outDir(), item === 'main' ? 'main' : item, `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** What one item's test meant to take and what it met, written whatever happened. */
interface Meta {
  item: string;
  title: string;
  url: string;
  theme: string;
  expected: string[];
  notes: string[];
  errors: string[];
}

function newMeta(item: string, title: string): Meta {
  return { item, title, url: '', theme: '', expected: [], notes: [], errors: [] };
}

function writeMeta(meta: Meta, watch?: ErrorWatch): void {
  if (watch) meta.errors.push(...watch.messages);
  const file = path.join(outDir(), 'meta', `${meta.item}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(meta, null, 2));
}

// ── Waiting for an item to have drawn everything ──────────────────────────────

/** The tiles that write a number or a word out, and what they say while still asking. */
const WRITTEN_TILES = '[id^="widgetValue-"], [id^="widgetTrend-"], [id^="widgetGauge-"], [id^="widgetProgress-"]';

/** What is still not drawn inside `root`, in words; empty when everything is. */
async function stillDrawing(root: Locator): Promise<string[]> {
  const pending: string[] = [];

  const written = await root.locator(WRITTEN_TILES).allInnerTexts();
  const asking = written.filter((text) => /^(\.\.\.|…)?$/.test(text.trim())).length;
  if (asking > 0) pending.push(`${asking} number tile(s) still asking`);

  const maps = root.locator('rb-map .leaflet-container');
  for (let i = 0; i < (await maps.count()); i++) {
    const state = await maps.nth(i).evaluate((box) => {
      const levels = Array.from(box.querySelectorAll('.leaflet-tile-container'))
        .filter((level) => level.querySelector('img.leaflet-tile')).length;
      const tiles = Array.from(box.querySelectorAll('img.leaflet-tile')) as HTMLImageElement[];
      const loading = tiles.filter((tile) => !tile.complete).length;
      return { levels, tiles: tiles.length, loading };
    });
    if (state.tiles === 0) pending.push(`map ${i + 1} has no tile yet`);
    else if (state.levels !== 1 || state.loading > 0) pending.push(`map ${i + 1} still loading tiles`);
  }

  const asked = await root.getByText(/^\s*(Loading|Answering)\b/).count();
  if (asked > 0) pending.push(`${asked} element(s) saying Loading/Answering`);
  return pending;
}

/** Everything in `root` drawn, or noted as not drawn after a minute; then the animations end. */
async function settle(page: Page, root: Locator, meta: Meta): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 })
    .catch(() => meta.notes.push('the network never went quiet within 30 s'));
  await waitForChartsIn(root, 60_000)
    .catch(() => meta.notes.push('a chart drew nothing within 60 s'));
  const until = Date.now() + 60_000;
  for (;;) {
    const pending = await stillDrawing(root).catch((e) => [`could not read the page: ${String(e).slice(0, 120)}`]);
    if (pending.length === 0) break;
    if (Date.now() > until) {
      meta.notes.push(`still not drawn after 60 s: ${pending.join('; ')}`);
      break;
    }
    await page.waitForTimeout(500);
  }
  // Chart.js animates for about a second after its data arrives.
  await page.waitForTimeout(1_500);
}

// ── Fitting an item into the viewport ─────────────────────────────────────────

/** The viewport made tall enough for `height` px of content, and the page given time to lay out again. */
async function fitHeight(page: Page, height: number, meta: Meta, width = WIDTH): Promise<void> {
  let wanted = Math.ceil(height) + 2 * MARGIN;
  if (wanted > MAX_HEIGHT) {
    meta.notes.push(`the item is ${Math.ceil(height)} px tall: cut to ${MAX_HEIGHT} px`);
    wanted = MAX_HEIGHT;
  }
  await page.setViewportSize({ width, height: Math.max(wanted, 600) });
  // A chart that fills its tile re-draws when its box changes.
  await page.waitForTimeout(1_000);
}

/** The whole page in the viewport at `width`, after it has drawn again, and its picture. */
async function shootWholePage(page: Page, root: Locator, file: string, meta: Meta, width = WIDTH): Promise<void> {
  for (let i = 0; i < 2; i++)
    await fitHeight(page, await page.evaluate(() => document.documentElement.scrollHeight), meta, width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, root, meta);
  meta.expected.push(path.relative(outDir(), file));
  await page.screenshot({ path: file });
}

/** One element whole in the viewport (a card), after it has drawn again, and its picture. */
async function shootElement(page: Page, element: Locator, file: string, meta: Meta): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const box = await element.boundingBox();
    await fitHeight(page, box?.height ?? 1000, meta);
    await element.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  await settle(page, element, meta);
  await wholeInViewport(page, element, meta);
  meta.expected.push(path.relative(outDir(), file));
  await element.screenshot({ path: file });
}

// ── Detail pictures ───────────────────────────────────────────────────────────

/** One picture per tile of the dashboard: the place to read its labels and numbers. */
async function shootTiles(root: Locator, item: string, theme: string, meta: Meta): Promise<void> {
  const tiles = root.locator('.grid-item');
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    const file = shotPath(item, `tile-${pad(i + 1)}-${theme}`);
    try {
      await tiles.nth(i).scrollIntoViewIfNeeded({ timeout: 10_000 });
      meta.expected.push(path.relative(outDir(), file));
      await tiles.nth(i).screenshot({ path: file });
    } catch (e) {
      meta.notes.push(`tile ${i + 1}: no picture (${String(e).slice(0, 160)})`);
    }
  }
}

/**
 * Every chart's tooltip, as a reader gets it: the mouse on the chart's first drawn point (the point
 * Chart.js itself puts its tooltip on), and a picture of the chart's tile.
 */
async function shootHovers(page: Page, root: Locator, item: string, theme: string, meta: Meta): Promise<void> {
  const charts = root.locator('rb-chart');
  const count = await charts.count();
  for (let i = 0; i < count; i++) {
    const chart = charts.nth(i);
    const file = shotPath(item, `hover-${pad(i + 1)}-${theme}`);
    try {
      await chart.scrollIntoViewIfNeeded({ timeout: 10_000 });
      const point = await chart.evaluate((host) => {
        const drawn: any = (host as any).getChartInstance?.();
        if (!drawn) return null;
        for (let d = 0; d < (drawn.data?.datasets?.length ?? 0); d++) {
          const element = drawn.getDatasetMeta(d)?.data?.find((one: any) => one && !one.skip);
          if (!element) continue;
          const at = element.tooltipPosition ? element.tooltipPosition(true) : { x: element.x, y: element.y };
          const rect = drawn.canvas.getBoundingClientRect();
          return { x: rect.left + at.x, y: rect.top + at.y };
        }
        return null;
      });
      if (!point) {
        meta.notes.push(`chart ${i + 1}: no drawn point to hover`);
        continue;
      }
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(700);
      const tile = chart.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " grid-item ")][1]');
      const target = (await tile.count()) > 0 ? tile : chart;
      meta.expected.push(path.relative(outDir(), file));
      await target.screenshot({ path: file });
    } catch (e) {
      meta.notes.push(`chart ${i + 1}: no hover picture (${String(e).slice(0, 160)})`);
    } finally {
      await page.mouse.move(0, 0).catch(() => undefined);
    }
  }
}

/** The page's document served in another theme than the installation's: the page wears what `<html>` names. */
async function wearTheme(page: Page, theme: string): Promise<void> {
  await page.route('**/dashboard/**', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/(<html[^>]*\bdata-theme=")[^"]*(")/, `$1${theme}$2`);
    await route.fulfill({ response, body });
  });
}

/** The other theme readers may meet: the shipped one is dark. */
const OTHER_THEME = 'light';

/** Whether `item` lies wholly inside the viewport: the claim a main picture makes. */
async function wholeInViewport(page: Page, item: Locator, meta: Meta): Promise<void> {
  const box = await item.boundingBox();
  const view = page.viewportSize();
  if (!box || !view) {
    meta.notes.push('the item has no box on the page');
    return;
  }
  const out: string[] = [];
  if (box.y < -1) out.push(`${Math.round(-box.y)} px above the viewport`);
  if (box.y + box.height > view.height + 1) out.push(`${Math.round(box.y + box.height - view.height)} px below it`);
  if (box.x < -1 || box.x + box.width > view.width + 1) out.push('wider than the viewport');
  if (out.length) meta.notes.push(`NOT WHOLE IN THE VIEWPORT: ${out.join(', ')}`);
}

// ── Share links ───────────────────────────────────────────────────────────────

/** A share link for one dashboard on its own page, as the demo spec makes them. */
async function shareLinkFor(reportId: string): Promise<string> {
  const created = await adminFetch(`${BASE_URL}/api/embed/share-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId }),
  });
  if (created.status !== 200) throw new Error(`no share link for ${reportId}: ${created.status}`);
  return (await created.json()).token as string;
}

async function revokeLinksFor(reportId: string): Promise<void> {
  const links = await adminFetch(
    `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(reportId)}`,
  ).then((r) => r.json());
  for (const link of links ?? [])
    await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
}

async function themeOf(page: Page): Promise<string> {
  return (await page.locator('html').getAttribute('data-theme').catch(() => null)) ?? '';
}

const itemOfDemo = (demo: Demo) => `dd${pad(demo.nn)}-${demo.id}`;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. The 25 dashboards the Gallery shows, each on its own page.
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Visual review — the 25 shown dashboards on their own pages', () => {
  test.beforeAll(async () => {
    test.setTimeout(30 * 60_000);
    await reseedDashDemoData(adminFetch, BASE_URL);
  });

  for (const demo of DEMOS) {
    test(`(visual) DD${pad(demo.nn)} ${demo.id}`, async ({ browser }) => {
      test.setTimeout(15 * 60_000);
      const reportId = shownReportId(demo);
      const item = itemOfDemo(demo);
      const meta = newMeta(item, `DD${pad(demo.nn)} ${demo.title}, own page /dashboard/${reportId}`);
      const page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
      const watch = watchForErrors(page);
      try {
        const token = await shareLinkFor(reportId);
        meta.url = `/dashboard/${reportId}`;
        await page.goto(`${BASE_URL}/dashboard/${reportId}?token=${encodeURIComponent(token)}`,
          { timeout: 120_000, waitUntil: 'networkidle' });
        meta.theme = await themeOf(page);
        const dashboard = page.locator('#publishedDashboard');
        await dashboard.waitFor({ state: 'visible', timeout: 60_000 });
        await settle(page, dashboard, meta);

        // MAIN: the whole page in the viewport: measured, fitted, measured again (a chart that fills
        // its tile re-draws at the new size), then drawn once more before the picture.
        const theme = meta.theme || 'shipped';
        await shootWholePage(page, dashboard, shotPath('main', item), meta);
        await wholeInViewport(page, dashboard, meta);

        // DETAILS (TODO 2b), in the shipped theme: each tile, each chart's tooltip, a phone, print.
        await shootTiles(dashboard, item, theme, meta);
        await shootHovers(page, dashboard, item, theme, meta);
        await page.setViewportSize({ width: 390, height: 900 });
        await settle(page, dashboard, meta);
        await shootWholePage(page, dashboard, shotPath(item, `phone-390-${theme}`), meta, 390);
        const wider = await page.evaluate(() => document.documentElement.scrollWidth);
        if (wider > 391) meta.notes.push(`at 390 px the page is ${wider} px wide (scrolls sideways)`);
        await page.emulateMedia({ media: 'print' });
        await shootWholePage(page, dashboard, shotPath(item, `print-${theme}`), meta);
        await page.emulateMedia({ media: 'screen' });

        // The other theme, from a fresh page served in it.
        const other = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
        const otherWatch = watchForErrors(other);
        try {
          await wearTheme(other, OTHER_THEME);
          await other.goto(`${BASE_URL}/dashboard/${reportId}?token=${encodeURIComponent(token)}`,
            { timeout: 120_000, waitUntil: 'networkidle' });
          const otherDashboard = other.locator('#publishedDashboard');
          await otherDashboard.waitFor({ state: 'visible', timeout: 60_000 });
          await settle(other, otherDashboard, meta);
          await shootWholePage(other, otherDashboard, shotPath(item, `page-${OTHER_THEME}`), meta);
          await shootTiles(otherDashboard, item, OTHER_THEME, meta);
        } finally {
          meta.errors.push(...otherWatch.messages.map((m) => `[${OTHER_THEME}] ${m}`));
          await other.close().catch(() => undefined);
        }
      } catch (e) {
        meta.notes.push(`FAILED: ${String(e).slice(0, 400)}`);
      } finally {
        writeMeta(meta, watch);
        await page.close().catch(() => undefined);
        await revokeLinksFor(reportId).catch(() => undefined);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. The Gallery: the page, then its 25 cards.
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Visual review — the Gallery', () => {
  let page: Page;
  let watch: ErrorWatch;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(30 * 60_000);
    await reseedDashDemoData(adminFetch, BASE_URL);
    const token = await createGalleryShareLink(adminFetch, BASE_URL);
    page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
    watch = watchForErrors(page);
    await page.goto(`${BASE_URL}/dashboard/${GALLERY_REPORT_ID}?token=${encodeURIComponent(token)}`,
      { timeout: 120_000, waitUntil: 'networkidle' });
  });

  test.afterAll(async () => {
    try {
      if (page) await page.close();
    } finally {
      await revokeGalleryShareLinks(adminFetch, BASE_URL);
    }
  });

  test('(visual) gallery page', async () => {
    test.setTimeout(10 * 60_000);
    const meta = newMeta('gallery-page', 'The Gallery: its title and contents list');
    try {
      meta.url = `/dashboard/${GALLERY_REPORT_ID}`;
      meta.theme = await themeOf(page);
      await page.setViewportSize({ width: WIDTH, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const top = page.locator('#dashboardDemosRoot');
      await top.waitFor({ state: 'visible', timeout: 60_000 });
      // The head of the page: its title and the contents list, down to the first card's top.
      const head = await page.evaluate(() => {
        const first = document.querySelector('#dashboardDemosRoot > [id^="dd-"]');
        return first ? first.getBoundingClientRect().top + window.scrollY : 1000;
      });
      await fitHeight(page, head, meta);
      await page.waitForTimeout(1_000);
      const main = shotPath('main', 'gallery-page');
      meta.expected.push(path.relative(outDir(), main));
      await page.screenshot({ path: main });
    } catch (e) {
      meta.notes.push(`FAILED: ${String(e).slice(0, 400)}`);
    } finally {
      const errors = [...watch.messages];
      watch.messages.length = 0;
      meta.errors.push(...errors);
      writeMeta(meta);
    }
  });

  for (const demo of DEMOS) {
    test(`(visual) gallery DD${pad(demo.nn)} ${demo.id}`, async () => {
      test.setTimeout(15 * 60_000);
      const item = `gallery-${itemOfDemo(demo)}`;
      const meta = newMeta(item, `Gallery card DD${pad(demo.nn)} ${demo.title} (draws ${shownReportId(demo)})`);
      meta.url = `/dashboard/${GALLERY_REPORT_ID}#${demo.id}`;
      try {
        meta.theme = await themeOf(page);
        const card = page.locator(`#${demo.id}`);
        await card.scrollIntoViewIfNeeded({ timeout: 30_000 });
        // The card loads when it is reached (lazy): its dashboard first, then its tiles.
        await card.locator(`[id="dashboard-${shownReportId(demo)}"]`).waitFor({ state: 'visible', timeout: 60_000 });
        await settle(page, card, meta);

        // MAIN: the card whole in the viewport, at its defaults.
        const theme = meta.theme || 'shipped';
        await shootElement(page, card, shotPath('main', item), meta);

        // DETAILS (TODO 2b): each story shown, then Reset. A card draws its twin where it has one, under
        // the twin's report id (owner decision 21).
        const shown = { ...demo, reportId: shownReportId(demo) };
        const stories = storiesOf(demo.id);
        for (const [i, story] of stories.entries()) {
          try {
            await clickShowMe(card, shown, story.id);
            await settle(page, card, meta);
            await shootElement(page, card, shotPath(item, `${pad(i + 1)}-story-${story.id}-${theme}`), meta);
          } catch (e) {
            meta.notes.push(`story ${story.id}: ${String(e).slice(0, 300)}`);
          }
        }
        if (stories.length > 0) {
          try {
            await clickReset(card, shown);
            await settle(page, card, meta);
            await shootElement(page, card, shotPath(item, `${pad(stories.length + 1)}-reset-${theme}`), meta);
          } catch (e) {
            meta.notes.push(`Reset: ${String(e).slice(0, 300)}`);
          }
        }
      } catch (e) {
        meta.notes.push(`FAILED: ${String(e).slice(0, 400)}`);
      } finally {
        // One page for all the cards: each card's test keeps the errors met while it ran.
        const errors = [...watch.messages];
        watch.messages.length = 0;
        meta.errors.push(...errors);
        writeMeta(meta);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Cube Stories: the page, then its 16 cards.
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Visual review — Cube Stories', () => {
  let page: Page;
  let frame: Frame;
  let watch: ErrorWatch;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    await reseedCubeDemoData(adminFetch, BASE_URL);
    const token = await createCubeStoriesShareLink(adminFetch, BASE_URL);
    page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
    watch = watchForErrors(page);
    await page.goto(`${BASE_URL}/dashboard/${CUBE_STORIES_REPORT_ID}?token=${encodeURIComponent(token)}`,
      { timeout: 120_000, waitUntil: 'networkidle' });
    frame = page.mainFrame();
  });

  test.afterAll(async () => {
    try {
      if (page) await page.close();
    } finally {
      await revokeCubeStoriesShareLinks(adminFetch, BASE_URL);
    }
  });

  test('(visual) cube page', async () => {
    test.setTimeout(10 * 60_000);
    const meta = newMeta('cube-stories-page', 'Cube Stories: title, subtitle and the industry panels');
    try {
      meta.url = `/dashboard/${CUBE_STORIES_REPORT_ID}`;
      meta.theme = await themeOf(page);
      await page.setViewportSize({ width: WIDTH, height: 1000 });
      const root = frame.locator('.rb-cube-stories-root');
      await root.waitFor({ state: 'visible', timeout: 60_000 });
      // The page as it opens: every panel closed but the one it opens on.
      await fitHeight(page, await page.evaluate(() => document.documentElement.scrollHeight), meta);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1_500);
      const main = shotPath('main', 'cube-stories-page');
      meta.expected.push(path.relative(outDir(), main));
      await page.screenshot({ path: main });
    } catch (e) {
      meta.notes.push(`FAILED: ${String(e).slice(0, 400)}`);
    } finally {
      const errors = [...watch.messages];
      watch.messages.length = 0;
      meta.errors.push(...errors);
      writeMeta(meta);
    }
  });

  for (const cubeId of CUBE_STORIES_PAGE_CARDS) {
    test(`(visual) cube ${cubeId}`, async () => {
      test.setTimeout(15 * 60_000);
      const card = cubeCardOf(cubeId);
      const item = `cube-${cubeId}`;
      const meta = newMeta(item, `Cube card ${cubeId} (${card.title})`);
      meta.url = `/dashboard/${CUBE_STORIES_REPORT_ID}#cube-${cubeId}`;
      try {
        meta.theme = await themeOf(page);
        await page.setViewportSize({ width: WIDTH, height: 1000 });
        await waitForCard(frame, cubeId, 90_000);
        const root = cardRoot(frame, cubeId);

        // A card means something once it answers a question: the first hint's Show Me fills the
        // field tree and draws its answer, which is what a reader is invited to do first.
        const first = asksOf(card)[0];
        if (first) {
          await cubeShowMe(frame, cubeId, first.id)
            .catch((e) => meta.notes.push(`Show Me on ${first.id} failed: ${String(e).slice(0, 300)}`));
          meta.notes.push(`shown: Show Me on '${first.id}' (${first.question})`);
        } else {
          meta.notes.push('the card offers no hint: shown as it opens');
        }
        await settle(page, root, meta);

        // MAIN: the card whole in the viewport, answering its first question.
        const theme = meta.theme || 'shipped';
        await shootElement(page, root, shotPath('main', item), meta);

        // DETAILS (TODO 2b): every other hint's Show Me, the card whole each time.
        for (const [i, ask] of asksOf(card).entries()) {
          if (i === 0) continue;
          try {
            await cubeShowMe(frame, cubeId, ask.id);
            await settle(page, root, meta);
            await shootElement(page, root, shotPath(item, `${pad(i + 1)}-hint-${ask.id}-${theme}`), meta);
          } catch (e) {
            meta.notes.push(`hint ${ask.id}: ${String(e).slice(0, 300)}`);
          }
        }
      } catch (e) {
        meta.notes.push(`FAILED: ${String(e).slice(0, 400)}`);
      } finally {
        const errors = [...watch.messages];
        watch.messages.length = 0;
        meta.errors.push(...errors);
        writeMeta(meta);
      }
    });
  }
});

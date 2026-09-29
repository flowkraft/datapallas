// ═══════════════════════════════════════════════════════════════════════════════
// cube-modes-parity.spec.ts
// The two modes give the same rows (Phase 3b, TODO 7j; design "Tests").
//
// A cube widget is published in one of two modes, and the Show In Dashboard tick
// is the whole difference:
//   • unchecked — the canvas turns the selection into SQL and the dashboard
//     carries that frozen SQL in its data script (`/api/reports/{id}/data`);
//   • checked   — the cube itself is published, and the viewer's questions are
//     answered live (`/api/reports/{id}/cube/{componentId}/query`).
//
// Someone who ticks the box is not asking for different numbers. So the SAME
// selection is published from the SAME canvas twice — once with the box off and
// once with it on — and the two dashboards must answer the same rows.
//
// The Java half of this runs on every asked vendor in the generated-SQL loop
// (GeneratedSqlAllVendorsTest, the two-mode checks). This half proves the same
// thing the way a person meets it: through the canvas, the Publish button and
// the published dashboard's own endpoints.
//
// Fixture: the SHIPPED sample connection `rbt-sample-northwind-sqlite-4f2` and
// the shipped `northwind-sales` cube, both reachable once the `showsamples`
// preference is on — as in D23 and D25. Nothing here is test-provisioned but
// the canvas, which the finally block deletes.
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Page, type Browser } from '@playwright/test';
import { Helpers } from '../../utils/helpers';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { getCanvasComponentIds } from '../../helpers/dashboard-test-helper';
import {
  createFreshCanvas,
  addCubeToCanvas,
  openCubeFolders,
  switchToWidget,
} from '../../helpers/explore-data-test-helper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = electronBeforeAfterAllTest as any;

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_HUB_APP_ID   = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click Publish, confirm, and return what the backend published the canvas as. */
async function publishDashboard(page: Page): Promise<{ reportId: string; dashboardUrl: string }> {
  // Let any in-flight preview queries settle before publish, so the server is
  // not competing for threads while it processes the export.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.locator('#btnPublishDashboard').click();
  const confirmBtn = page.locator('#btnPublishConfirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });

  const [response] = await Promise.all([
    page.waitForResponse(
      r => /\/explorations\/[^/]+\/export$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 90_000 },
    ),
    confirmBtn.click(),
  ]);
  const body = await response.json();

  await page.locator('#publishSuccess').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#btnPublishClose').click();

  return { reportId: body.reportId, dashboardUrl: body.dashboardUrl };
}

/** Delete the canvas the way a person does, so a run leaves nothing behind. */
async function deleteCanvasViaUI(page: Page, canvasName: string): Promise<void> {
  await page.goto(DATA_CANVAS_URL);
  await page.waitForLoadState('networkidle');
  // The delete button is opacity-0 until hover; force bypasses the visibility check
  await page.locator(`[aria-label="Delete canvas ${canvasName}"]`).click({ force: true });
  await page.locator('#btnConfirmDeleteCanvas').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnConfirmDeleteCanvas').click();
  await page.waitForTimeout(1_500);
}

/**
 * The rows as a set of text lines, so two answers are compared by what they say
 * and not by the order they say it in, nor by how a driver spelled a number: a
 * number is written to two decimals, everything else to its own text.
 */
function asRows(rows: Array<Record<string, unknown>>): string[] {
  return rows
    .map(row => Object.values(row)
      .map(value => (typeof value === 'number' ? value.toFixed(2) : String(value)))
      .join(' | '))
    .sort();
}

/** What the answer says in total, for one measure — a number two answers can be compared by. */
function totalOf(rows: Array<Record<string, unknown>>, measure: string): number {
  return rows.reduce((sum, row) => sum + Number(row[measure]), 0);
}

// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Cube widgets — the two publishing modes', () => {
  let externalBrowser: Browser | null = null;
  let page: Page;
  // Stored so afterAll can stop the AI Hub server regardless of test outcome
  let electronPage: Page | null = null;

  test.beforeAll(async ({ beforeAfterAll }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = beforeAfterAll as any;
    electronPage = process.env.TEST_ENV === 'electron'
      ? await app.firstWindow()
      : app.context.pages()[0];
    // This page is the worker's, opened without signing in; on the Server it still shows the login form.
    await Helpers.signInIfLoginFormIsShown(electronPage!);

    // No connection is created: this spec runs on the shipped sample one.
    await SelfServicePortalsTestHelper.startApp(
      new FluentTester(electronPage!).gotoApps(),
      AI_HUB_APP_ID,
    );
    const result = await SelfServicePortalsTestHelper.createExternalBrowser();
    externalBrowser = result.browser;
    await Helpers.signInBrowserContext(result.context);
    await SelfServicePortalsTestHelper.waitForServerReady(result.page, AI_HUB_BASE_URL);
    page = result.page;
  });

  test.afterAll(async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    if (externalBrowser) await externalBrowser.close();
    if (electronPage) {
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(electronPage).gotoApps(),
        AI_HUB_APP_ID,
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // The same selection, published both ways, answers the same rows.
  //
  //   • the positive half — the frozen dashboard's /data rows and the live
  //     dashboard's /query rows are the same set of rows, the Germany filter
  //     included on both sides;
  //   • the negative half — that agreement is not the agreement of two answers
  //     that both forgot the filter: the same live cube asked WITHOUT the chip
  //     says more, and says more money.
  //
  // Made to go red: `expect(mode2).toEqual(mode1)`. A mode that loses the
  // author's filter on the way out — the exporter dropping the widget's
  // segments, or the runtime ignoring the entry's own `initial.filters` — makes
  // one side Germany and the other side everywhere, and the two lists differ.
  // ────────────────────────────────────────────────────────────────────────────
  test('The same selection, published both ways, answers the same rows', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'Cube modes parity';
    const cubeId = 'northwind-sales';
    const sampleConnectionCode = 'rbt-sample-northwind-sqlite-4f2';

    // As in D23 and D25: the shipped sample connection and its bound cubes are
    // hidden from the canvas until this preference is on.
    await page.goto(AI_HUB_BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      // Through the app's /api/dp proxy, as the app itself does: it carries the session + CSRF token.
      const res = await fetch('/api/dp/system/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { showsamples: true } }),
      });
      if (!res.ok) throw new Error(`enable showsamples failed: ${res.status} ${await res.text()}`);
    });

    try {
      // ── One canvas, one selection: a country's categories and their money ──
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(sampleConnectionCode);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });

      await addCubeToCanvas(page, cubeId);
      await switchToWidget(page, 'tabulator');

      // CategoryName comes from the joined Categories table, so its folder is
      // opened first; Revenue is a measure of the cube itself.
      await openCubeFolders(page, ['chk-dim-CategoryName']);
      await page.locator('#chk-dim-CategoryName').check();
      await page.locator('#chk-meas-Revenue').check();

      // A filter as well as ticks: a selection whose filter a mode could lose is
      // the selection worth publishing twice.
      await page.locator('#btnFilter-ShipCountry').click();
      await page.locator('#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#cubeFilterParams').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#ShipCountry').click();
      await page.locator('#ShipCountry_cb_Germany').waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('#ShipCountry_cb_Germany').click();
      await page.locator('#ShipCountry_btnOk').click();
      await page.locator('#btnFilterApply').click();
      await expect(page.locator('#chipFilter-ShipCountry')).toContainText('Ship Country: Germany');
      await page.waitForTimeout(1_500); // autosave debounce

      const canvasId = page.url().split('/').pop()!;

      // ── Mode 1: Show In Dashboard unchecked — the frozen SQL ──────────────
      await expect(page.locator('#chkCubeShowInDashboard')).not.toBeChecked();
      const frozen = await publishDashboard(page);
      const frozenIds = await getCanvasComponentIds(page, canvasId);
      const componentId = (frozenIds['tabulator'] ?? [])[0];
      expect(componentId).toBeTruthy();

      await page.goto(frozen.dashboardUrl);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      // Unticked, the cube is a widget like any other, drawn from frozen SQL.
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-cube-renderer')).toHaveCount(0);

      const frozenAnswer = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/data?componentId=${cid}`);
        if (!r.ok) throw new Error(`frozen data failed: ${r.status} ${await r.text()}`);
        return r.json();
      }, { rid: frozen.reportId, cid: componentId });
      expect(frozenAnswer.data.length).toBeGreaterThan(0);
      const mode1 = asRows(frozenAnswer.data);

      // ── Mode 2: the same canvas, the box ticked — the cube itself ─────────
      // The rows above are read BEFORE this second publish, because a canvas
      // publishes to its own dashboard and the second export rewrites the first.
      await page.goto(`${DATA_CANVAS_URL}/${canvasId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('#chkCubeShowInDashboard').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('#chkCubeShowInDashboard').check();
      await expect(page.locator('#cubeOnCanvasNote')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_500); // autosave debounce

      const live = await publishDashboard(page);

      await page.goto(live.dashboardUrl);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      // Ticked, this widget IS the cube: the field tree, not a drawn result.
      await expect(page.locator('rb-cube-renderer')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(0);
      await expect(page.locator('#cubeRuntimeResult')).toContainText('Beverages', { timeout: 30_000 });

      // The dashboard opens on the author's own selection, so that selection is
      // what the live cube is asked — the entry the exporter wrote, read back.
      const meta = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/meta`);
        if (!r.ok) throw new Error(`meta failed: ${r.status} ${await r.text()}`);
        return r.json();
      }, { rid: live.reportId, cid: componentId });
      expect(meta.initial.dimensions).toEqual(['CategoryName']);
      expect(meta.initial.measures).toEqual(['Revenue']);
      expect(meta.initial.filters[0].member).toBe('ShipCountry');
      expect(meta.initial.filters[0].values).toEqual(['Germany']);

      // A live cube is asked with POST, and a POST on this browser's own session carries the
      // CSRF token the server issued (D4) - as the tile itself now does.
      const liveAsked = await Helpers.sessionFetch(
        page, `/api/reports/${live.reportId}/cube/${componentId}/query`, { body: meta.initial });
      if (liveAsked.status !== 200)
        throw new Error(`live query failed: ${liveAsked.status} ${JSON.stringify(liveAsked.body)}`);
      const liveAnswer = liveAsked.body;
      // A cut answer is not an answer to compare: it would say less for a reason
      // that has nothing to do with the two modes.
      expect(liveAnswer.truncated).toBe(false);
      const mode2 = asRows(liveAnswer.rows);

      // ── The whole point: the same rows, both ways ──────────────────────────
      expect(mode2).toEqual(mode1);

      // ── The negative half ─────────────────────────────────────────────────
      // The two agree because Germany is in both answers, not because it is in
      // neither: the same live cube, asked the same question without the chip,
      // answers more rows and more money.
      const askedWithoutTheChip = await Helpers.sessionFetch(
        page, `/api/reports/${live.reportId}/cube/${componentId}/query`,
        { body: { dimensions: meta.initial.dimensions, measures: meta.initial.measures } });
      if (askedWithoutTheChip.status !== 200)
        throw new Error(`live query failed: ${askedWithoutTheChip.status} `
          + JSON.stringify(askedWithoutTheChip.body));
      const everywhere = askedWithoutTheChip.body;
      expect(asRows(everywhere.rows)).not.toEqual(mode1);
      expect(totalOf(everywhere.rows, 'Revenue'))
        .toBeGreaterThan(totalOf(frozenAnswer.data, 'Revenue'));
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });
});

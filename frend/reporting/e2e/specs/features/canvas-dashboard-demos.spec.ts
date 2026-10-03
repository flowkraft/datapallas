// ═══════════════════════════════════════════════════════════════════════════════
// canvas-dashboard-demos.spec.ts
// Each of the 25 Dashboard Demos, REBUILT in the Canvas like a user does it, published, and proved the
// same as the one that ships (Phase C, section 9.4).
//
// Per demo: a fresh canvas on the sample connection; its recipe (`e2e/dashboard-demos/recipes/`) done
// through the UI by `runRecipe`; the canvas the server saved compared with the shipped
// `g-<id>.canvas.json` (`assertSameCanvas`); then the published dashboard held to the SAME
// `checks.json` the shipped one is (`assertDemoDashboard`, `runInteractions`).
//
// Nothing here states a demo, a widget or a number: the demos are the shipped index, the steps are
// the recipes, the values are the checks. A demo added to the index and given a recipe is walked
// with no new test code.
//
// How to run (the owner does; written and type-checked, never run by the phase that wrote it):
//   E2E_SPEC='canvas-dashboard-demos' bash asbl/ci/dp-ci.sh e2e
//   E2E_SPEC='canvas-dashboard-demos' E2E_GREP='DD14' bash asbl/ci/dp-ci.sh e2e        (one demo)
//   E2E_DD_SCREENSHOTS=1 ... (the "How it was built" pictures: taken by Phase D's build-shots.ts)
//
// Needs the web components staged first: npm run custom:compile-and-stage-web-components.
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Browser, type Page } from '@playwright/test';

import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { Helpers } from '../../utils/helpers';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { reseedDashDemoData, type AdminFetch } from '../../helpers/dashboard-demos-test-helper';
import { DEMOS, loadCanvas, loadChecks, rebuiltWidgetsOf, type Demo } from '../../helpers/dashboard-demos/demo-catalog';
import {
  assertDemoDashboard,
  openPublished,
  runInteractions,
  watchForErrors,
} from '../../helpers/dashboard-demos/published-dashboard-checks';
import { assertSameCanvas, stateOf } from '../../helpers/dashboard-demos/canvas-parity';
import { runRecipe, shotsEnabled } from '../../helpers/dashboard-demos/recipe-runner';
import type { Recipe } from '../../helpers/dashboard-demos/recipe';
import {
  AI_HUB_APP_ID,
  AI_HUB_BASE_URL,
  SERVER_URL,
  canvasIdOf,
  deleteReportAsAdmin,
  readCanvas,
  readShowSamples,
  setShowSamples,
  withFreshCanvas,
} from '../../helpers/dashboard-demos/canvas-mechanics-helper';
import { publishDashboard } from '../../helpers/explore-data-test-helper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = electronBeforeAfterAllTest as any;

const adminFetch: AdminFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

/** A demo's recipe, by the file name its number and id give it. */
function recipeOf(demo: Demo): Recipe {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(`../../dashboard-demos/recipes/${String(demo.nn).padStart(2, '0')}-${demo.id}.recipe`).recipe;
}

const DD_TITLE = (demo: Demo) =>
  `(dashboard demos) DD${String(demo.nn).padStart(2, '0')} ${demo.title}`
  + ' — rebuilt in the Canvas like a user, published, same as shipped';

test.describe('Dashboard Demos rebuilt in the Canvas', () => {
  let externalBrowser: Browser | null = null;
  let electronPage: Page | null = null;
  let page: Page;
  let showedSamplesBefore = false;

  test.beforeAll(async ({ beforeAfterAll }: { beforeAfterAll: unknown }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = beforeAfterAll as any;
    electronPage = process.env.TEST_ENV === 'electron' ? await app.firstWindow() : app.context.pages()[0];
    await Helpers.signInIfLoginFormIsShown(electronPage!);

    // The data first: every check is a row of the demo data seeded for one fixed day.
    await reseedDashDemoData(adminFetch, SERVER_URL);

    await SelfServicePortalsTestHelper.startApp(new FluentTester(electronPage!).gotoApps(), AI_HUB_APP_ID);
    const result = await SelfServicePortalsTestHelper.createExternalBrowser();
    externalBrowser = result.browser;
    await Helpers.signInBrowserContext(result.context);
    await SelfServicePortalsTestHelper.waitForServerReady(result.page, AI_HUB_BASE_URL);
    page = result.page;

    // The sample connection the demos live on is hidden until this preference is on.
    showedSamplesBefore = await readShowSamples(page);
    await setShowSamples(page, true);
    if (shotsEnabled()) {
      console.warn('E2E_DD_SCREENSHOTS is set: the pictures are taken by Phase D (build-shots.ts); this run takes none.');
    }
  });

  test.afterAll(async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    if (page && !showedSamplesBefore) await setShowSamples(page, false);
    if (externalBrowser) await externalBrowser.close();
    if (electronPage) {
      await SelfServicePortalsTestHelper.stopApp(new FluentTester(electronPage).gotoApps(), AI_HUB_APP_ID);
    }
  });

  for (const demo of DEMOS) {
    test(DD_TITLE(demo), async () => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      const recipe = recipeOf(demo);
      const canvasName = `E2E DD${String(demo.nn).padStart(2, '0')} ${demo.title}`;
      let reportId: string | undefined;

      try {
        await withFreshCanvas(page, canvasName, async (canvasId) => {
          // 1. Everything done through the UI, as a person does it.
          const published = await runRecipe(page, recipe);
          reportId = published.reportId;
          expect(canvasIdOf(page), 'the recipe stayed on its canvas').toBe(canvasId);

          // 2. Same as shipped: the canvas the server saved is the canvas that ships.
          const rebuilt = await readCanvas(page, canvasId);
          assertSameCanvas(rebuilt, loadCanvas(demo.id));

          // 3. Works like shipped: the same checks, the same data, the dashboard the recipe published.
          const asBuilt: Demo = {
            ...demo,
            reportId: published.reportId,
            rebuilt: rebuiltWidgetsOf(demo.id, stateOf(rebuilt)),
          };
          const checks = loadChecks(demo.id);
          const watch = watchForErrors(page);
          const body = await openPublished(page, published.reportId);
          await assertDemoDashboard(body, asBuilt, checks);
          await runInteractions(body, asBuilt, checks);
          watch.assertNone(`${demo.id} rebuilt, on its own page`);

          // 4. Publishing again changes nothing about where it lives (DD02 only, the demo with a title to change).
          if (demo.id === 'dd-sales-overview') await rePublishKeepsTheReport(canvasId, published.reportId, canvasName);
        });
      } finally {
        if (reportId) await deleteReportAsAdmin(reportId);
      }
    });
  }

  /** Rename the canvas (its name is the dashboard's title) the way a person does. */
  async function renameCanvas(name: string): Promise<void> {
    await page.locator('#btnCanvasName').click();
    await page.locator('#txtDashboardName').waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('#txtDashboardName').fill(name);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }

  /** Change the canvas' title, publish again: the same report id. */
  async function rePublishKeepsTheReport(canvasId: string, reportId: string, canvasName: string): Promise<void> {
    await page.goto(`${AI_HUB_BASE_URL}/explore-data/${canvasId}`);
    await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });
    await renameCanvas(`${canvasName}, renamed`);
    const again = await publishDashboard(page);
    expect(again.reportId, 'publishing again keeps the report id').toBe(reportId);
  }
});

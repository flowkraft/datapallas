// ═══════════════════════════════════════════════════════════════════════════════
// build-shots.ts
// The pictures of the "How it was built" pages (section 9.6, Phase D).
//
// `canvas-dashboard-demos.spec.ts` rebuilds each demo in the Canvas with `runRecipe`. With
// `E2E_DD_SCREENSHOTS=1` it also hands `runRecipe` the `capture` of `createBuildShots`, and the same run
// leaves, per demo, one folder in the docs site:
//
//   <docs>/public/images/docs/dashboard-demos/<nn>-<id>/<ss>-<step-slug>.png
//   <docs>/public/images/docs/dashboard-demos/<nn>-<id>/steps.json   [{n, title, caption, image, code?}]
//
// `components/build-steps.tsx` of the site draws `steps.json`: a number, the picture, the caption and, where
// there is one, the code with a copy button.
//
// WHICH PICTURES, IN WHICH ORDER
//
//   1. `start`:   the empty canvas with the connection picked, before the first step;
//   2. `capture`: one picture per recipe step that has a `shot`: the step's result, ringed, with the
//                 step's title and caption as its callout. One user intention, one picture;
//   3. `finish`:  the published dashboard on its own page, then the demo's first story answered - the
//                 dashboard opened with the story's values in its URL (TODO 5f), the same view Show Me gives
//                 on the Gallery. A demo with no story ends on its first interaction's filters instead.
//
// A picture is taken AFTER the step's result is on screen: the widget has drawn (and no widget shows an
// error), every chart has painted. Errors are never hidden: a widget in error fails the run, naming the
// step, instead of ending up in a picture.
//
// With the switch off this module does nothing: no page call, no file. The normal e2e stays fast.
// ═══════════════════════════════════════════════════════════════════════════════

import * as path from 'path';
import * as jetpack from 'fs-jetpack';
import type { Locator, Page } from '@playwright/test';

import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlight,
  clearErrorLogsForScreenshots,
  hideToastsForScreenshots,
  waitForRbChartsRendered,
} from '../../utils/docs-screenshot-helper';
import { getLastWidgetId } from '../explore-data-test-helper';
import { loadChecks, loadStories, pad, type Demo } from './demo-catalog';
import { openPublished, readParams, waitForChartsIn, watchForErrors } from './published-dashboard-checks';
import type { Recipe, Step } from './recipe';
import { shotsEnabled, type RecipeResult } from './recipe-runner';

/** The viewport every picture is taken at, as `canvas-dashboard.screens.ts`. */
export const SHOT_VIEWPORT = { width: 1500, height: 900 };

/** One entry of a demo's `steps.json`. `image` is the path the docs site serves the picture at. */
export interface StepEntry {
  n: number;
  title: string;
  caption: string;
  image: string;
  code?: string;
}

/** What takes the picture: the docs helpers by default, a recorder in `build-shots.check.ts`. */
export interface Shooter {
  /** `ring` is the control the step used; `callout` is its words. Without a ring, a plain picture. */
  take(page: Page, file: string, outDir: string, ring?: Locator, callout?: string): Promise<void>;
}

export interface BuildShots {
  /** False when the switch is off: every method below then returns at once and touches nothing. */
  enabled: boolean;
  /** The pictures taken so far, in order: what `steps.json` will say. */
  readonly entries: StepEntry[];
  /** The empty canvas with the connection picked. Call it before the recipe's first step. */
  start(): Promise<void>;
  /** `runRecipe`'s `capture`: called after each step, once its result is on screen. */
  capture(step: Step, index: number): Promise<void>;
  /** The published dashboard, a story answered, and `steps.json`. */
  finish(published: RecipeResult): Promise<void>;
}

export interface BuildShotsOptions {
  /** Default: `E2E_DD_SCREENSHOTS=1`. */
  enabled?: boolean;
  /** Default: the docs site's `public/images/docs/dashboard-demos`. */
  imagesRoot?: string;
  shooter?: Shooter;
}

/** The URL path the docs site serves a demo's pictures under (`public/` is its root). */
const PUBLIC_ROOT = '/images/docs/dashboard-demos';

const docsShooter: Shooter = {
  async take(page, file, outDir, ring, callout) {
    if (ring) await captureDocsScreenshotWithHighlight(page, file, { target: ring, calloutText: callout }, outDir);
    else await captureDocsScreenshot(page, file, outDir);
  },
};

export function createBuildShots(
  page: Page,
  recipe: Recipe,
  demo: Demo,
  options: BuildShotsOptions = {},
): BuildShots {
  const enabled = options.enabled ?? shotsEnabled();
  if (!enabled) {
    return { enabled: false, entries: [], start: async () => {}, capture: async () => {}, finish: async () => {} };
  }

  const folder = `${pad(demo.nn)}-${demo.id}`;
  const outDir = path.join(options.imagesRoot ?? path.join(DOCS_IMAGES_DIR, 'dashboard-demos'), folder);
  const shooter = options.shooter ?? docsShooter;
  const entries: StepEntry[] = [];
  /** The widget the last step put on the canvas, which the following steps shape (as `runRecipe`). */
  let widgetId = '';

  /** One picture, one entry of `steps.json`. */
  async function shoot(
    title: string,
    caption: string,
    ring?: Locator,
    code?: string,
  ): Promise<void> {
    const n = entries.length + 1;
    const file = `${String(n).padStart(2, '0')}-${slug(title)}.png`;
    await shooter.take(page, file, outDir, ring, `${title}\n${plain(caption)}`);
    entries.push({ n, title, caption, image: `${PUBLIC_ROOT}/${folder}/${file}`, ...(code ? { code } : {}) });
  }

  return {
    enabled: true,
    entries,

    async start() {
      // A rerun replaces the demo's pictures: a step removed from the recipe leaves no stale picture.
      jetpack.dir(outDir, { empty: true });
      await page.setViewportSize(SHOT_VIEWPORT);
      await hideToastsForScreenshots(page);
      await hideCanvasToasts(page);
      await clearErrorLogsForScreenshots(page);
      await shoot(
        'The empty canvas',
        'Open a new canvas and pick the **DuckDB sample connection**, which holds the demo data.',
        page.locator('#selectConnection'),
      );
    },

    async capture(step, index) {
      if (step.kind === 'pickTable' || step.kind === 'pickCube' || (step.kind === 'addElement' && step.element === 'text')) {
        widgetId = await getLastWidgetId(page);
      }
      if (!step.shot) return;

      try {
        if (needsData(step)) await widgetDrawn(page, widgetId);
        await waitForRbChartsRendered(page);
        await noWidgetInError(page);
      } catch (e) {
        throw new Error(`${recipe.id}, step ${index + 1} (${step.kind}) '${step.shot.title}': ${(e as Error).message}`);
      }
      await shoot(step.shot.title, step.shot.caption, ringOf(page, step, widgetId), step.shot.code ?? codeOf(step));
    },

    async finish(published) {
      const watch = watchForErrors(page);

      // 1. The published dashboard, on its own page.
      const body = await openPublished(page, published.reportId);
      await waitForChartsIn(body);
      await shoot(
        'The published dashboard',
        'The dashboard has its own page, with its filters on top. Anyone you share it with sees this.',
      );

      // 2. A story answered: the same dashboard, opened the way Show Me opens it.
      const answer = answerOf(demo);
      if (answer) {
        const opened = await openPublished(page, published.reportId, answer.params);
        await waitForChartsIn(opened);
        const standing = await readParams(opened, demo);
        for (const [name, value] of Object.entries(answer.params)) {
          if (String(value).includes('{')) continue; // a date the server resolves, not the bar
          if (standing[name] !== String(value))
            throw new Error(`${recipe.id}: the link set ${name}=${String(value)}, the dashboard's bar says '${standing[name]}'`);
        }
        await shoot(answer.title, answer.caption);
      }
      watch.assertNone(`${recipe.id}, published and answered, for its pictures`);

      jetpack.write(path.join(outDir, 'steps.json'), JSON.stringify(entries, null, 2) + '\n');
    },
  };
}

// ── What a picture rings, waits for and carries ───────────────────────────────

/** Steps that leave a result to draw in the current widget. A Text or a Divider has no such step. */
function needsData(step: Step): boolean {
  switch (step.kind) {
    case 'visualQuery':
    case 'cubeFields':
    case 'sql':
    case 'script':
    case 'visualizeAs':
    case 'displayConfig':
      return true;
    default:
      return false;
  }
}

/** The control the step used, which the picture rings. A `highlight` in the recipe wins. */
function ringOf(page: Page, step: Step, widgetId: string): Locator | undefined {
  if (step.shot?.highlight) return page.locator(`[id="${step.shot.highlight}"]`);
  switch (step.kind) {
    case 'filters':
      return page.locator('rb-parameters');
    case 'layout':
      return page.locator('.react-grid-layout').first();
    case 'publish':
      return page.locator('#btnPublishDashboard');
    default:
      return widgetId ? page.locator(`[id="widget-${widgetId}"]`) : undefined;
  }
}

/** SQL, a script or a DSL the reader can copy, written as the step typed it. */
function codeOf(step: Step): string | undefined {
  switch (step.kind) {
    case 'sql':
      return step.sql;
    case 'script':
      return step.script;
    case 'filters':
      return step.via === 'dsl' ? step.dsl : undefined;
    case 'displayConfig':
      return step.dsl;
    default:
      return undefined;
  }
}

/** The story that ends the page, or, with none, the first interaction its checks hold the demo to. */
export function answerOf(demo: Demo): { title: string; caption: string; params: Record<string, unknown> } | undefined {
  const story = loadStories(demo.id)[0];
  if (story) {
    return {
      title: `The story: ${story.question}`,
      caption: `Open the dashboard with the filters set for it. ${story.text}`,
      params: story.params ?? {},
    };
  }
  const checks = loadChecks(demo.id);
  const interaction = (checks.interactions ?? []).find((one) => Object.keys(one.params ?? {}).length > 0);
  if (!interaction) return undefined;
  return {
    title: 'A filter applied',
    caption: 'Pick a value in a filter and every tile that depends on it answers.',
    params: interaction.params,
  };
}

// ── Waiting, and refusing a picture of an error ───────────────────────────────

/**
 * The widget has drawn what its step made: some `rb-*` component is in it and nothing is still
 * loading. `waitForWidgetData` knows only some of the tags; Progress, Sankey and Detail are also drawn.
 */
async function widgetDrawn(page: Page, id: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (wid) => {
      const widget = document.getElementById(`widget-${wid}`);
      if (!widget) return false;
      if (widget.querySelector('.text-destructive')) return true; // reported by noWidgetInError
      if (widget.querySelector('.animate-spin')) return false;
      return Array.from(widget.querySelectorAll('*')).some((el) => el.tagName.startsWith('RB-'));
    },
    id,
    { timeout, polling: 300 },
  );
}

/** Errors must SCREAM: a widget showing one is never photographed. */
async function noWidgetInError(page: Page): Promise<void> {
  const errors = await page.locator('[id^="widget-"] .text-destructive').allTextContents();
  if (errors.length > 0) throw new Error(`a widget shows an error: ${errors[0].trim().slice(0, 200)}`);
}

/** The Canvas' own toasts (success, info) are not part of a step; an error toast stays. */
async function hideCanvasToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('__hide_canvas_toasts_for_screenshots')) return;
    const style = document.createElement('style');
    style.id = '__hide_canvas_toasts_for_screenshots';
    style.textContent = '#app-toaster [data-sonner-toast]:not([data-type="error"]) { display: none !important; }';
    document.head.appendChild(style);
  });
}

// ── Words ─────────────────────────────────────────────────────────────────────

/** `Pick **orders**` as the callout writes it: no markdown marks. */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/** `Pick the orders table` → `pick-the-orders-table`. */
export function slug(title: string): string {
  return plain(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'step';
}

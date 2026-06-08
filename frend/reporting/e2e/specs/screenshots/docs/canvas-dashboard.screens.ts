// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Canvas Dashboard build walkthrough (for datapallas.com docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Builds a 6-widget "Northwind Sales Overview" dashboard on the Data Canvas
// step-by-step. KPI-led layout (the canonical Tableau / Metabase / Superset
// skeleton): 3 headline numbers across the top, full-width revenue trend in
// the middle, categorical breakdown + leaderboard table at the bottom.
//
//   Row 1 (h:2): [Total Revenue w:4][Total Orders w:4][Pareto Share w:4]
//   Row 2 (h:4): [────── Monthly Revenue Trend w:12 ──────]
//   Row 3 (h:4): [── Chart: Category w:5 ──][── Top 10 Products w:7 ──]
//
// Coverage: 4 Visual / 1 Finetune-SQL / 1 Finetune-Groovy. Single SQLite
// connection (sales + customers cubes; no inventory). The Visual count
// emphasizes that /explore-data is a UI-first dashboard builder; Finetune
// is reserved for genuinely non-visual logic (Pareto distribution math,
// month-bucketed time grouping which the cube tree can't express today).
//
// Output PNGs (under c:\Projects\kraft-src-company-biz\flowkraft\www\datapallas.com\public\images\docs\):
//   - 300_20_dashboard-build-0-title.png          (Text block — UI Element, dashboard title)
//   - 300_30_dashboard-build-1-kpi-revenue.png    (Number — Total Revenue, Visual)
//   - 300_40_dashboard-build-2-kpi-orders.png     (Number — Total Orders, Visual)
//   - 300_50_dashboard-build-3-kpi-pareto.png     (Number — Pareto, Finetune Groovy)
//   - 300_60_dashboard-build-4-trend.png          (Trend — Monthly Revenue, Finetune SQL)
//   - 300_70_dashboard-build-5-chart.png          (Chart — Revenue by Category, Visual)
//   - 300_80_dashboard-build-6-tabulator.png      (Tabulator — All Products, Visual)
//   - 300_90_dashboard-final.png                  (Hero shot)
//
// Each step's PNG must show BOTH the widget body (rendered KPI / chart / etc.)
// AND the right-panel state that produced it (ticked cube checkboxes for
// Visual mode, the SQL/Groovy editor with the typed code for Finetune mode).
// `scrollChecksIntoView` and `scrollEditorIntoView` are called right before
// `captureDocsScreenshot` to guarantee the relevant evidence is visible.
//
// HOW TO RUN
//     cd frend/reporting
//     npm run custom:start-server-and-e2e-electron-screens -- --grep "Canvas dashboard"
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, Browser, Page } from '@playwright/test';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  createFreshCanvas,
  addCubeToCanvas,
  addUIElement,
  arrangeWidgets,
  clickDataTab,
  runSqlQuery,
  runGroovyScript,
  WEB_COMPONENT,
  type WidgetType,
} from '../../../helpers/explore-data-test-helper';
import { getCanvasComponentIds } from '../../../helpers/dashboard-test-helper';
import { captureDocsScreenshot } from '../../../utils/docs-screenshot-helper';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
const VIEWPORT = { width: 1500, height: 900 };

/** Bundled SQLite Northwind connection — single connection per canvas, so all
 *  cubes used in the dashboard (sales + customers) belong to it. */
const SAMPLE_CONNECTION_CODE = 'rbt-sample-northwind-sqlite-4f2';

// ── SQL + GROOVY SNIPPETS ─────────────────────────────────────────────────────

/** Monthly revenue trend — 24 monthly buckets across the dataset's span.
 *  Switched from visual+cube to Finetune SQL because cube mode doesn't expose
 *  a per-dim time-bucket selector — ticking OrderDate gives raw daily
 *  granularity, and the rb-trend headline becomes "yesterday's revenue" with
 *  a meaningless day-over-day delta. With monthly buckets the headline reads
 *  "last month's total revenue, ±X% vs prior month" — the meaningful KPI.
 *
 *  IMPORTANT — the `/1000, 'unixepoch'` modifier:
 *    Hibernate persists `Order.OrderDate` (Java LocalDateTime) as an INTEGER
 *    epoch-MILLISECONDS column in the SQLite DB (see NorthwindDataGenerator.java).
 *    SQLite's `strftime` expects ISO date strings, Julian day numbers, or Unix
 *    epoch SECONDS (with the 'unixepoch' modifier). Calling
 *    `strftime('%Y-%m', o.OrderDate)` on a raw integer epoch returns NULL for
 *    every row — they all collapse to one NULL group, GROUP BY produces a
 *    single row with the grand total, and the Trend headline shows that total
 *    with no sparkline. Divide by 1000 to convert ms→s, then 'unixepoch' tells
 *    strftime to interpret the integer as Unix epoch.  Same fix is used in
 *    explore-data-use-cases.spec.ts:312. */
const SQL_MONTHLY_TREND = `SELECT
  STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') AS month,
  ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue
FROM Orders o
JOIN "Order Details" od ON o.OrderID = od.OrderID
GROUP BY 1
ORDER BY 1`;

/** Pareto KPI: what % of revenue comes from the top 20% of customers?
 *  Distribution math (sort, slice, ratio) is the natural Finetune-Groovy use
 *  case. Returns a single-row List<Map>; the Number widget reads the first
 *  numeric field — and uses the FIELD NAME as the user-facing label when no
 *  `displayConfig.numberLabel` is set. So instead of a snake_case identifier,
 *  emit human-friendly labels directly via Groovy quoted-key map syntax. */
const GROOVY_PARETO = `def rows = ctx.dbSql.rows("""
    SELECT cu.CompanyName AS customer,
           ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue
    FROM Customers cu
    JOIN Orders o ON cu.CustomerID = o.CustomerID
    JOIN "Order Details" od ON o.OrderID = od.OrderID
    GROUP BY cu.CustomerID, cu.CompanyName
    ORDER BY revenue DESC
""")

def total = rows.collect { it.revenue }.sum() ?: 0
def topN = Math.max(1, (int)Math.ceil(rows.size() * 0.20))
def topRevenue = rows.take(topN).collect { it.revenue }.sum() ?: 0
def share = total > 0 ? (topRevenue / total) * 100.0 : 0

return [[
  "Top 20% Share": Math.round(share) / 100.0,
  "Top N Customers": topN,
  "Total Customers": rows.size()
]]`;
// NOTE on the `/ 100.0`: rb-value's "percent" formatter does
// `Math.round(value * 100) + '%'` — it MULTIPLIES by 100 because it expects a
// fraction (0..1). Returning 0.36 lets us flip Format → "Percent" in the
// Number widget Display panel and render "36%" cleanly. If we returned 36 the
// percent formatter would emit "3600%". Same constraint as any
// dashboard tool that distinguishes "share as fraction" from "share as percent".

// ── PER-STEP HELPERS ──────────────────────────────────────────────────────────

/** After every `addCubeToCanvas` the right panel auto-binds to the new widget,
 *  but real-mouse drag/resize from the previous step can re-mount the panel
 *  against an older widget. Re-clicking the just-added widget header guarantees
 *  the right panel is showing ITS tree before we tick checkboxes. */
async function selectLastWidget(page: Page): Promise<void> {
  await page.locator('[id^="widgetHeader-"]').last().click();
  // Long settle: clicking the header re-binds the right panel to this widget,
  // VisualQueryBuilder re-mounts, the rb-cube-renderer's on:change handlers
  // get rewired. If we touch a checkbox before that pipeline is done, the
  // .check() succeeds visually but its on:change isn't bound yet — toggleMeasure
  // never fires, the Set stays empty, no SQL is generated, and the widget hangs
  // on `loading=true`. Cold-start budget: the FIRST widget's right-panel mount
  // (cube schema fetch + Svelte cube-renderer compile) is the slow path; later
  // widgets reuse cached schema and finish well under this budget.
  await page.waitForTimeout(4_000);
}

/** Read the most recently-added widget's id from the DOM. Used by
 *  `waitForWidgetData` to scope the data-arrival probe to this widget. */
async function getLastWidgetId(page: Page): Promise<string> {
  const headerId = await page.locator('[id^="widgetHeader-"]').last().getAttribute('id');
  if (!headerId) throw new Error('No widget header found in DOM');
  return headerId.replace(/^widgetHeader-/, '');
}

/** Poll the just-added widget's body until the data fetch has actually landed
 *  — i.e. the widget body is no longer just a spinner / loading dots / empty
 *  placeholder. Surfaces the failure here (with a precise message) so a hung
 *  data fetch doesn't cascade into a useless "rb-value not visible" timeout
 *  30s later in `waitForVizRender`.
 *
 *  Uses purely DOM signals so it works without exposing the Zustand canvas
 *  store: the widget body either contains a viz web-component (rb-value /
 *  rb-trend / rb-chart / rb-tabulator / rb-pivot-table / etc.) once data
 *  arrives, or it shows the React `<Loader2>` spinner (`.animate-spin`)
 *  while loading, or it shows a `.text-destructive` error block, or the
 *  WidgetShell empty state ("Select to configure data"). The first signal
 *  means SUCCESS; the others diagnose the failure mode. */
async function waitForWidgetData(
  page: Page,
  widgetId: string,
  timeoutMs: number = 30_000,
): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const state = await page.evaluate((id) => {
      const widget = document.getElementById(`widget-${id}`);
      if (!widget) return { phase: 'no-widget' as const };
      // Error block — surface the message immediately, no point polling.
      const errorEl = widget.querySelector('.text-destructive');
      if (errorEl) {
        return { phase: 'error' as const, message: (errorEl.textContent || '').trim().slice(0, 300) };
      }
      // Any rb-* viz tag means the widget has data and rendered (or is at
      // least mid-mount with the data prop pushed). For Number widgets we
      // also accept rb-value showing dots — the secondary content-poll in
      // waitForVizRender catches that residual case.
      const viz = widget.querySelector(
        'rb-value, rb-trend, rb-chart, rb-tabulator, rb-pivot-table, rb-map, rb-sankey, rb-gauge, rb-progress, rb-detail',
      );
      if (viz) return { phase: 'rendered' as const, tag: (viz as Element).tagName.toLowerCase() };
      // Loader2 spinner — useWidgetData reports loading=true.
      if (widget.querySelector('.animate-spin')) return { phase: 'loading' as const };
      // WidgetShell empty state — no dataSource set yet.
      const placeholder = widget.querySelector('.text-muted-foreground');
      if (placeholder) {
        return { phase: 'placeholder' as const, message: (placeholder.textContent || '').trim().slice(0, 200) };
      }
      return { phase: 'unknown' as const, html: widget.innerHTML.slice(0, 200) };
    }, widgetId);

    if (state.phase === 'rendered') return;
    if (state.phase === 'error') {
      throw new Error(`Widget ${widgetId} errored during data fetch: ${state.message}`);
    }

    if (Date.now() - start > timeoutMs) {
      const detail =
        state.phase === 'loading'
          ? 'still loading (useWidgetData has loading=true) — likely /generate-cube-sql or executeQuery hung'
          : state.phase === 'placeholder'
            ? `widget body still showing placeholder: "${state.message}" — dataSource was never set (cube tick → VisualQueryBuilder → updateWidgetDataSource didn't fire)`
            : state.phase === 'no-widget'
              ? 'widget DOM element disappeared'
              : `unknown widget state, body html: ${state.html}`;
      throw new Error(`Widget ${widgetId} data never arrived after ${timeoutMs}ms — ${detail}`);
    }

    await page.waitForTimeout(300);
  }
}

/** Switch the selected widget to `vizType`. Falls back to the "More widgets"
 *  drawer when Smart Defaults parks an off-shape pick (e.g. Number on a 2-D
 *  result) under the secondary grid. */
async function setVisualization(page: Page, vizType: WidgetType): Promise<void> {
  const btn = page.locator(`#btnVisualizeAs-${vizType}`);
  if (!(await btn.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const moreBtn = page.locator('#btnMoreWidgets');
    if (await moreBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(300);
    }
  }
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  // changeWidgetRenderMode swaps the widget body's web-component (rb-tabulator
  // → rb-value etc.); the new component mounts asynchronously and reads from
  // the data source. Give it space — bumping this from 1.5s to 2.5s removed
  // the intermittent "rb-value not visible" timeouts on cold AI Hub starts.
  await page.waitForTimeout(2_500);
}

/** Tick visual checkboxes for the given dim/measure names. Empty `dims` is
 *  valid (single-cell scalar, e.g. for KPI Number widgets that just want
 *  SUM(measure) with no breakdown — the cube SQL generator skips GROUP BY
 *  when no dim is selected, see CubeSqlGenerator.java:217).
 *
 *  Two important subtleties:
 *
 *  1. **Untick-before-tick**. Multiple cube widgets on the same cube share
 *     the SAME Svelte rb-cube-renderer instance (right panel re-binds
 *     widget but the component doesn't re-mount). Its internal
 *     `selectedDimensions` / `selectedMeasures` Sets persist between
 *     widgets. Without resetting first, widget N inherits widget N-1's
 *     selections — that's why the early hero showed "$58,153 Revenue"
 *     twice (widget 2 carried widget 1's Revenue tick) and the Chart
 *     plotted OrderDate-as-bars (widget 5 carried widget 4's OrderDate).
 *     Untick everything currently checked first, then tick the desired
 *     set. The intermediate "all unchecked" dispatches hit
 *     VisualQueryBuilder's empty-detail early-return so they don't churn
 *     the backend.
 *
 *  2. **No explicit `selectionChanged` dispatch**. The Svelte component's
 *     `on:change` already fires `selectionChanged` internally, which
 *     VisualQueryBuilder listens for. A second synthetic dispatch races
 *     two concurrent generateCubeSql calls and locks the widget on
 *     `loading=true`. canvas.screens.ts works without it; we do too. */
async function tickFields(
  page: Page,
  dims: string[],
  measures: string[],
): Promise<void> {
  // Lead-in settle. Even after selectLastWidget's 4s the right panel can
  // still be wiring up listeners — extra grace before the first click.
  // Cold-start budget: the FIRST cube widget pays the schema fetch + Svelte
  // cube-renderer compile cost; later widgets reuse cached state.
  await page.waitForTimeout(3_000);

  const checkedDims = await page.locator('input[id^="chk-dim-"]:checked').all();
  for (const box of checkedDims) {
    await box.uncheck();
    await page.waitForTimeout(400);
  }
  const checkedMeas = await page.locator('input[id^="chk-meas-"]:checked').all();
  for (const box of checkedMeas) {
    await box.uncheck();
    await page.waitForTimeout(400);
  }
  // Each tick triggers Svelte's selectionChanged → VisualQueryBuilder's async
  // generateCubeSql HTTP round-trip → widget data source update → useWidgetData
  // refetch. Real users pause ~1s between clicks; do the same instead of
  // hammering at 200ms intervals (which forced concurrent generateCubeSql
  // calls to race and was the root cause of the early "stuck loading" bugs).
  for (const d of dims) {
    await page.locator(`#chk-dim-${d}`).check();
    await page.waitForTimeout(800);
  }
  for (const m of measures) {
    await page.locator(`#chk-meas-${m}`).check();
    await page.waitForTimeout(800);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  // Final settle — generate-sql + query + render fully drains before the
  // next step (setVisualization or screenshot). Bumped from 3s to 5s after a
  // cold-start regression where widget 1's data fetch never completed; the
  // upstream root cause is verified with `waitForWidgetData` in each step,
  // and this tail just gives the visual pipeline space to draw before any
  // subsequent click.
  await page.waitForTimeout(5_000);
}

/** Wait for the just-added widget's actual viz to be rendered (not just the
 *  empty placeholder). Each widget type maps to a specific web component via
 *  WEB_COMPONENT; `.last()` targets the most recently added one. 30s budget
 *  because the AI Hub container can be slow on first query after a cold
 *  start (esp. when this spec runs after canvas.screens.ts + cubes.screens.ts).
 *
 *  Number widgets need a deeper check than "element is visible". rb-value
 *  initializes with `loading=true` and renders the literal text "..." (its
 *  own loading dots) until React's useEffect fires `el.data = result.data`.
 *  At mount time the element is visible but the inner span shows "..." —
 *  if we screenshot here, the docs PNG captures dots instead of "$58,153".
 *  Wait until textContent stops being "..." and starts looking like the
 *  rendered value (a digit or currency symbol). Only the first widget on a
 *  cold AI Hub usually needs this extra wait, but the check is cheap so we
 *  apply it to every Number widget. */
/** Final compact layout for the dashboard's 7 widgets (1 title text + 6 data).
 *  Used by `arrangeAndHighlight` to compact the canvas after EACH widget
 *  addition so all widgets-so-far stay visible in the 900px viewport. The
 *  alternative — leaving each new widget at its default size until the end —
 *  pushes later widgets below the fold, defeating the docs walkthrough's
 *  "see what you just built" goal. */
const FINAL_LAYOUT = [
  { x: 0, y: 0,  w: 12, h: 1 }, // 0. Title text
  { x: 0, y: 1,  w: 4,  h: 1 }, // 1. Total Revenue
  { x: 4, y: 1,  w: 4,  h: 1 }, // 2. Total Orders
  { x: 8, y: 1,  w: 4,  h: 1 }, // 3. Pareto Share
  { x: 0, y: 2,  w: 12, h: 3 }, // 4. Trend
  { x: 0, y: 5,  w: 5,  h: 4 }, // 5. Chart
  { x: 5, y: 5,  w: 7,  h: 4 }, // 6. Tabulator
];

/** After every widget step, run this BEFORE the screenshot:
 *
 *   1. Compact-arrange all widgets-so-far into their FINAL layout slots
 *      (via partial `arrangeWidgets`) so nothing gets pushed off-viewport.
 *   2. Reselect the just-added widget so the right panel re-binds (cube
 *      renderer / Finetune editor re-mounts and reads the saved state —
 *      ticked checkboxes / typed SQL show up).
 *   3. Scroll the relevant evidence into view in the right panel (the
 *      ticked measure/dim, or the SQL/Groovy editor).
 *   4. Paint a prominent blue ring on the current widget's container so
 *      the docs reader instantly sees WHICH widget this step just built.
 *      Uses the same `box-shadow` injection trick as cubes.screens.ts.
 *
 *  Returns a dispose() callback the caller invokes after the screenshot to
 *  remove the highlight before the next step. */
async function arrangeAndHighlight(
  page: Page,
  canvasId: string,
  widgetIndex: number,            // 1-indexed; widgetIndex=2 means title + first KPI present
  currentWidgetId: string,
  rightPanel: 'visual' | 'sql' | 'script',
  cubeFields?: { dims: string[]; measures: string[] },
): Promise<() => Promise<void>> {
  // 1. Compact arrangement — only the widgets-so-far, in their final slots.
  await arrangeWidgets(page, canvasId, FINAL_LAYOUT.slice(0, widgetIndex));

  // 2. Reselect — clicking the header binds the right panel to this widget,
  //    triggers the canvas-store's selectedWidgetId update, paints the
  //    isSelected ring, and re-mounts rb-cube-renderer / Finetune editor
  //    against the widget's saved visualQuery / sql / script.
  await page.locator(`#widgetHeader-${currentWidgetId}`).click();
  // Long settle so the cube renderer's onMount has time to re-tick boxes
  // from the widget's visualQuery, and the Finetune editor has time to
  // restore the saved code.
  await page.waitForTimeout(2_000);

  // 3. Scroll the right panel to the relevant evidence.
  if (rightPanel === 'visual' && cubeFields) {
    await page.locator('#btnDataTab').click().catch(() => {});
    await page.waitForTimeout(400);

    // Re-tick the saved cube fields. rb-cube-renderer's selectedDimensions /
    // selectedMeasures Sets are purely INTERNAL state — see RbCubeRenderer.wc.svelte
    // lines 65-79: they reset to empty on every mount, with NO prop/attribute to
    // initialize them from the widget's saved visualQuery. After arrangeWidgets'
    // page.reload(), the widget re-renders with its data (queryResults survive
    // in canvas-store), but the cube checkboxes show ALL UNCHECKED — exactly
    // what the user reported as "the cube tree on the right doesn't show
    // Revenue ticked". Re-checking via Playwright fires the .check() click →
    // Svelte's on:change → toggleMeasure → adds to Set → updates the visual.
    // It also dispatches selectionChanged → VisualQueryBuilder calls
    // generateCubeSql, but useWidgetData's LAST_EXEC short-circuits the refetch
    // when the SQL hasn't changed (which it hasn't — same selection).
    for (const d of cubeFields.dims) {
      const cb = page.locator(`#chk-dim-${d}`);
      if (await cb.count() > 0 && !(await cb.isChecked().catch(() => false))) {
        await cb.check().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    for (const m of cubeFields.measures) {
      const cb = page.locator(`#chk-meas-${m}`);
      if (await cb.count() > 0 && !(await cb.isChecked().catch(() => false))) {
        await cb.check().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    // Settle so any generateCubeSql round-trip completes (idempotent — same
    // SQL, useWidgetData skips re-execution).
    await page.waitForTimeout(1_500);

    const target = cubeFields.measures[0]
      ? `#chk-meas-${cubeFields.measures[0]}`
      : (cubeFields.dims[0] ? `#chk-dim-${cubeFields.dims[0]}` : null);
    if (target) {
      await page.locator(target).scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
    }
  } else {
    await page.locator('#btnDataTab').click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('#btnQueryTab-finetune').click().catch(() => {});
    await page.waitForTimeout(300);
    const editor = rightPanel === 'sql' ? '#sqlEditorContainer' : '#scriptEditorContainer';
    await page.locator(editor).scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
  }

  // 4. Inject a prominent blue ring around the current widget. Using the same
  //    box-shadow trick as cubes.screens.ts so the highlight is part of the
  //    element's own paint and survives any ancestor overflow / stacking.
  await page.evaluate((id) => {
    const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
    if (!el) return;
    el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
    el.dataset.docscreenPrevTransition = el.style.transition ?? '';
    el.style.transition = 'none';
    el.style.boxShadow =
      '0 0 0 4px #2563eb, 0 0 24px rgba(37, 99, 235, 0.45)';
  }, currentWidgetId);
  await page.waitForTimeout(200);

  return async () => {
    await page.evaluate((id) => {
      const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
      if (!el) return;
      el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
      el.style.transition = el.dataset.docscreenPrevTransition ?? '';
      delete el.dataset.docscreenPrevShadow;
      delete el.dataset.docscreenPrevTransition;
    }, currentWidgetId);
  };
}

async function waitForVizRender(page: Page, vizType: WidgetType): Promise<void> {
  const sel = WEB_COMPONENT[vizType];
  const el = page.locator(sel).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  if (vizType === 'number') {
    await el.evaluate(
      (node) => new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const text = (node.textContent || '').trim();
          // Done when text is non-empty AND not the loading dots ("..." or "…").
          if (text && text !== '...' && text !== '…') return resolve();
          if (Date.now() - start > 30_000) return reject(new Error(`rb-value still loading after 30s (text="${text}")`));
          setTimeout(tick, 100);
        };
        tick();
      }),
    );
  }
  await page.waitForTimeout(1000);
}

/** Drive the right-panel "Display" tab → Label input to override the auto-
 *  generated label (which falls back to the field/measure name — e.g. raw
 *  cube measure names "OrderCount" or Groovy keys like "Top 20% Share" leak
 *  to the user). Setting the label via the Display panel writes
 *  `displayConfig.numberLabel`, which is preserved through Publish into the
 *  exported DSL — so the published dashboard renders the friendly label too.
 *
 *  Switches back to the Data tab afterwards so the next step (which expects
 *  the cube tree / SQL editor) sees a familiar panel state. */
async function setNumberLabel(page: Page, label: string): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(800);
  // NumberConfig.tsx renders one <input> inside #configPanel-number — the
  // Label field. The placeholder uniquely identifies it among the panel's
  // <select>s and dim/measure pickers.
  await page.locator('#configPanel-number input[placeholder*="Auto"]').fill(label);
  await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(800);
}

/** Drive the Number widget's Format dropdown (number / currency / percent / raw).
 *  Use 'percent' on a fractional value (0..1) to render "36%" instead of the
 *  raw number. The dropdown id is `selectNumberFormat`. */
async function setNumberFormat(
  page: Page,
  format: 'number' | 'currency' | 'percent' | 'raw',
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(800);
  await page.locator('#selectNumberFormat').selectOption(format);
  await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(800);
}

/** Same idea as setNumberLabel but for the Trend widget — TrendConfig.tsx
 *  writes its label into `displayConfig.label` (different key than Number). */
async function setTrendLabel(page: Page, label: string): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(800);
  await page.locator('#configPanel-trend input[placeholder*="Auto"]').fill(label);
  await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(800);
}

/** Click "Publish Dashboard", confirm, await the export response, return the
 *  backend-generated reportId + absolute dashboardUrl. Mirrors the helper at
 *  explore-data-use-cases.spec.ts:168 — keeping the body identical means tests
 *  stay aligned if that one evolves. The export writes Groovy + HTML + DSLs
 *  to `frend/reporting/testground/e2e/config/reports/{reportId}/`, which is
 *  exactly what we want on disk for post-run inspection. */
async function publishDashboard(page: Page): Promise<{ reportId: string; dashboardUrl: string }> {
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
  await expect(page.locator('#publishSuccess')).toBeVisible();
  await page.locator('#btnPublishClose').click();

  return { reportId: body.reportId, dashboardUrl: body.dashboardUrl };
}

// ── SPEC ──────────────────────────────────────────────────────────────────────

electronBeforeAfterAllTest(
  'Canvas dashboard — docs screenshots',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;

    try {
      // ── SETUP: AI Hub + external Chromium pointed at :8440 ───────────────
      console.log('[SETUP] Starting AI Hub from cmsWebPortalTab');
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage).gotoDataCanvas(),
        AI_HUB_APP_ID,
      );
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
      externalBrowser = browser;
      await page.setViewportSize(VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);
      console.log('[SETUP] external browser ready at AI Hub');

      // ───────────────────────────────────────────────────────────────────────
      // STEP 1 — Open a fresh canvas and bind the database connection
      // ───────────────────────────────────────────────────────────────────────
      // A "canvas" in /explore-data is your blank dashboard surface. Each
      // canvas binds to ONE database connection — switching connection wipes
      // the cube list — so you pick the connection FIRST and add widgets on
      // top of it. We use the bundled `rbt-sample-northwind-sqlite-4f2`
      // sample so this demo runs anywhere DataPallas runs, no setup needed.
      await createFreshCanvas(page, DATA_CANVAS_URL, 'Northwind Sales Overview');
      const canvasId = page.url().split('/').pop()!;
      console.log(`[SETUP] canvasId: ${canvasId}`);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(SAMPLE_CONNECTION_CODE);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(800);

      // ───────────────────────────────────────────────────────────────────────
      // STEP 2 — Set the stage with a title (UI Element: Text)
      // ───────────────────────────────────────────────────────────────────────
      // Before any data widget, drop a Text block at the top of the canvas to
      // give the dashboard a clear title and one short sentence of context.
      // Text elements support markdown — `##` for a section heading, plain
      // text for the subtitle. Good dashboards lead with context: tell the
      // reader who it's for and what's on it before showing numbers.
      console.log('[STEP 2] Adding UI Element — text header');
      await addUIElement(page, 'text', {
        textContent:
          '## Northwind Sales Overview\n\n' +
          'Headline KPIs · monthly revenue trend · category breakdown · top products.',
      });
      // Settle so the text widget renders its markdown before capture.
      await page.waitForTimeout(1_500);
      await captureDocsScreenshot(page, '300_20_dashboard-build-0-title.png');

      // ───────────────────────────────────────────────────────────────────────
      // STEP 3 — KPI #1: Total Revenue (Visual, cube)
      // ───────────────────────────────────────────────────────────────────────
      // The simplest possible visual flow: drop a cube onto the canvas, tick
      // the measure you want, switch the visualization to "Number". With
      // ZERO dimensions ticked the cube emits `SELECT SUM(Revenue) FROM cube`
      // (no GROUP BY) — exactly what a top-line KPI needs.
      //
      // The auto-generated label would be the raw cube field name "Revenue",
      // which is fine here, but we override it with `setNumberLabel` to show
      // the same flow we'll need for less-readable field names below.
      console.log('[STEP 3] KPI 1 — Total Revenue (Visual)');
      await addCubeToCanvas(page, 'northwind-sales');
      await selectLastWidget(page);
      const widgetId3 = await getLastWidgetId(page);
      await tickFields(page, [], ['Revenue']);
      // Confirm the cube tick → generate-cube-sql → executeQuery chain
      // actually delivered data BEFORE we swap the widget viz. This is the
      // primary gate against the cold-start "data never arrives" failure;
      // if it times out, the error message names the actual symptom (still
      // loading / placeholder / error) instead of failing 30s later at
      // waitForVizRender with a vague "rb-value not visible".
      await waitForWidgetData(page, widgetId3);
      await setVisualization(page, 'number');
      await setNumberLabel(page, 'Total Revenue');
      await waitForVizRender(page, 'number');
      // Compact-arrange the 2 widgets-so-far (title + KPI 1), reselect this
      // widget so the cube tree shows the Revenue tick, paint the blue ring.
      const dispose3 = await arrangeAndHighlight(
        page, canvasId, 2, widgetId3, 'visual', { dims: [], measures: ['Revenue'] },
      );
      await captureDocsScreenshot(page, '300_30_dashboard-build-1-kpi-revenue.png');
      await dispose3();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 4 — KPI #2: Total Orders (Visual, cube)
      // ───────────────────────────────────────────────────────────────────────
      // Same flow as KPI #1, different measure. The cube measure name is
      // CamelCase ("OrderCount"), which leaks straight to the user as the
      // label if we don't override — `setNumberLabel('Total Orders')` makes
      // it human-readable on both the canvas AND the published dashboard
      // (the override is persisted in `displayConfig.numberLabel`).
      console.log('[STEP 4] KPI 2 — Total Orders (Visual)');
      await addCubeToCanvas(page, 'northwind-sales');
      await selectLastWidget(page);
      const widgetId4 = await getLastWidgetId(page);
      await tickFields(page, [], ['OrderCount']);
      await waitForWidgetData(page, widgetId4);
      await setVisualization(page, 'number');
      await setNumberLabel(page, 'Total Orders');
      await waitForVizRender(page, 'number');
      const dispose4 = await arrangeAndHighlight(
        page, canvasId, 3, widgetId4, 'visual', { dims: [], measures: ['OrderCount'] },
      );
      await captureDocsScreenshot(page, '300_40_dashboard-build-2-kpi-orders.png');
      await dispose4();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 5 — KPI #3: Top-20% Customer Share (Finetune Groovy)
      // ───────────────────────────────────────────────────────────────────────
      // Some KPIs aren't a single SUM. The Pareto principle ("80% of revenue
      // from 20% of customers") needs distribution math: query all customers
      // sorted by revenue, slice the top quintile, divide. Visual mode can't
      // express that. Finetune → Script (Groovy) lets you write a tiny block
      // of code that returns a `List<Map>`; the Number widget reads the
      // first numeric field as the headline. We switch viz to Number BEFORE
      // running the script so the single-row result lands in the right shape.
      console.log('[STEP 5] KPI 3 — Top-20% Customer Share (Finetune Groovy)');
      await addCubeToCanvas(page, 'northwind-customers');
      await selectLastWidget(page);
      const widgetId5 = await getLastWidgetId(page);
      await setVisualization(page, 'number');
      await runGroovyScript(page, GROOVY_PARETO);
      // Confirm the Groovy script ran and rb-value (or any viz) actually got
      // the result row before we touch the Display panel — Groovy scripts
      // can take a couple of seconds on first execution.
      await waitForWidgetData(page, widgetId5);
      // Crystal-clear label: the value is "what percent of total revenue
      // comes from the top 20% of customers". A label like "Top 20% Share"
      // forces the reader to guess. Spelling it out — even at the cost of a
      // slightly longer label — leaves zero ambiguity.
      await setNumberLabel(page, '% of Revenue from Top 20% Customers');
      // Format → Percent. The Groovy returns a fraction (0.36); rb-value's
      // percent formatter renders it as "36%". Without this, the headline
      // would show "0.36" — informative but visually confusing on a KPI card.
      await setNumberFormat(page, 'percent');
      await waitForVizRender(page, 'number');
      // Pareto is Finetune Groovy — right panel must show the script editor.
      const dispose5 = await arrangeAndHighlight(
        page, canvasId, 4, widgetId5, 'script',
      );
      await captureDocsScreenshot(page, '300_50_dashboard-build-3-kpi-pareto.png');
      await dispose5();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 6 — Trend: Monthly Revenue (Finetune SQL)
      // ───────────────────────────────────────────────────────────────────────
      // The Trend widget shows "current vs prior period" — only meaningful
      // when the data is bucketed (monthly / quarterly). Cube visual mode
      // groups by raw OrderDate (~daily), giving the headline a noisy
      // last-day value. Finetune → SQL with `STRFTIME('%Y-%m', OrderDate /
      // 1000, 'unixepoch')` produces 24 monthly rows; the rb-trend headline
      // becomes "last month vs prior month" — the meaningful version.
      // (See SQL_MONTHLY_TREND for the `/1000, 'unixepoch'` rationale.)
      console.log('[STEP 6] Trend — Monthly Revenue (Finetune SQL)');
      // Order matches the proven-working pattern from
      // explore-data-use-cases.spec.ts:104-107 — runSqlQuery FIRST so the
      // widget has data when the visualization type is switched. Switching
      // to chart/trend BEFORE data arrives can leave the widget in a "no
      // data" rendering state that doesn't recover when data later arrives.
      await addCubeToCanvas(page, 'northwind-sales');
      await selectLastWidget(page);
      const widgetId6 = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_MONTHLY_TREND);
      // Confirm the SQL fetch returned BEFORE switching viz — see waitForWidgetData docstring.
      await waitForWidgetData(page, widgetId6);
      // Dismiss any CodeMirror autocomplete popup left over by the Finetune
      // SQL editor (typing "DESC" / "ORDER" pops up keyword suggestions),
      // and force the right panel back to the Data tab so subsequent
      // setVisualization clicks land on the right palette.
      await clickDataTab(page);
      await setVisualization(page, 'trend');
      // Setting the rb-trend headline label so the published dashboard reads
      // unambiguously: the headline "$X" is *last month's revenue*, and the
      // delta below it ("▼/▲ Y% vs prior") then reads as "vs prior MONTH"
      // by context. Without spelling out the comparison period in the label,
      // readers see "$682 ▼ 85% vs prior" and have to guess what "prior" is.
      await setTrendLabel(page, "Last month's revenue (vs. prior month)");
      await waitForVizRender(page, 'trend');
      // Trend is Finetune SQL — right panel must show the SQL editor with
      // STRFTIME visible, otherwise the docs reader sees the headline
      // number but no visible cause for it.
      const dispose6 = await arrangeAndHighlight(
        page, canvasId, 5, widgetId6, 'sql',
      );
      await captureDocsScreenshot(page, '300_60_dashboard-build-4-trend.png');
      await dispose6();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 7 — Chart: Revenue by Category (Visual, cube)
      // ───────────────────────────────────────────────────────────────────────
      // Pure visual cube flow: tick the CategoryName dim + Revenue measure,
      // switch viz to Chart. Cube mode emits `GROUP BY CategoryName ORDER BY
      // CategoryName` so bars come out alphabetical (Beverages, Condiments,
      // …, Seafood) rather than revenue-sorted. That's a UX trade-off: we
      // give up "biggest-first" framing in exchange for keeping this widget
      // in pure UI-tick mode (no SQL, nothing for the user to read or edit).
      console.log('[STEP 7] Chart — Revenue by Category (Visual)');
      await addCubeToCanvas(page, 'northwind-sales');
      await selectLastWidget(page);
      const widgetId7 = await getLastWidgetId(page);
      await tickFields(page, ['CategoryName'], ['Revenue']);
      await waitForWidgetData(page, widgetId7);
      await setVisualization(page, 'chart');
      await waitForVizRender(page, 'chart');
      const dispose7 = await arrangeAndHighlight(
        page, canvasId, 6, widgetId7, 'visual', { dims: ['CategoryName'], measures: ['Revenue'] },
      );
      await captureDocsScreenshot(page, '300_70_dashboard-build-5-chart.png');
      await dispose7();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 8 — Tabulator: All Products by Revenue (Visual, cube)
      // ───────────────────────────────────────────────────────────────────────
      // Tick ProductName + CategoryName dims and Revenue + TotalQuantity
      // measures, switch viz to Tabulator. Cube mode has no LIMIT support, so
      // this returns ALL ~77 products (not Top-10). rb-tabulator handles that
      // fine — column headers are click-sortable, so the user can sort by
      // Revenue ↓ to recover the "leaderboard" experience without SQL.
      console.log('[STEP 8] Tabulator — All Products by Revenue (Visual)');
      await addCubeToCanvas(page, 'northwind-sales');
      await selectLastWidget(page);
      const widgetId8 = await getLastWidgetId(page);
      await tickFields(page, ['ProductName', 'CategoryName'], ['Revenue', 'TotalQuantity']);
      await waitForWidgetData(page, widgetId8);
      await setVisualization(page, 'tabulator');
      await waitForVizRender(page, 'tabulator');
      const dispose8 = await arrangeAndHighlight(
        page, canvasId, 7, widgetId8, 'visual',
        { dims: ['ProductName', 'CategoryName'], measures: ['Revenue', 'TotalQuantity'] },
      );
      await captureDocsScreenshot(page, '300_80_dashboard-build-6-tabulator.png');
      await dispose8();

      // ───────────────────────────────────────────────────────────────────────
      // STEP 9 — All 7 widgets are already in their final compact slots
      // ───────────────────────────────────────────────────────────────────────
      // Each per-widget step called arrangeAndHighlight, which compact-arranges
      // ALL widgets-so-far in their FINAL_LAYOUT positions on every iteration.
      // By the time Step 8 finishes, the canvas is already laid out exactly as
      // the docs hero shot needs. We just deselect any widget (so no isSelected
      // ring leaks into 300_90), wait for everything to settle, and capture.
      console.log('[STEP 9] Final canvas hero — settle, deselect, capture');
      await page.evaluate(() => {
        document.body.click();
      }).catch(() => {});
      await page.waitForTimeout(800);
      await page.locator('rb-value').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('rb-trend').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('rb-chart').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('rb-tabulator').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(2_000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      await page.waitForTimeout(500);

      // ───────────────────────────────────────────────────────────────────────
      // STEP 10 — Capture the canvas hero (the docs' main payload)
      // ───────────────────────────────────────────────────────────────────────
      // This is THE screenshot the docs use to show readers what their
      // finished dashboard should look like. It's deliberately taken from
      // the /explore-data canvas (with the editor chrome — schema browser,
      // visualize-as panel) because the docs are teaching how to BUILD on
      // the canvas, not how to view a published dashboard.
      await captureDocsScreenshot(page, '300_90_dashboard-final.png');

      // ───────────────────────────────────────────────────────────────────────
      // STEP 11 — Publish the dashboard
      // ───────────────────────────────────────────────────────────────────────
      // "Publish Dashboard" tells the backend to export the canvas state to
      // a Report bundle: a Groovy script (one widget = one `if (!componentId
      // || componentId == 'X')` block), an HTML template, and per-widget
      // DSLs. The bundle lives at config/reports/{reportId}/ and is what
      // the published dashboard URL re-renders against — the same artifacts
      // a CI pipeline or scheduled job would consume.
      //
      // We capture the canvas component IDs BEFORE publishing because
      // ScriptAssembler.componentId() derives them from the canvas state
      // (mirrored by getCanvasComponentIds), and they're what the published
      // dashboard's data API expects.
      console.log('[STEP 11] Publishing dashboard');
      const componentIds = await getCanvasComponentIds(page, canvasId);
      const { reportId, dashboardUrl } = await publishDashboard(page);
      console.log(`[STEP 11] reportId=${reportId} url=${dashboardUrl}`);

      // ───────────────────────────────────────────────────────────────────────
      // STEP 12 — Verify the published dashboard renders end-to-end
      // ───────────────────────────────────────────────────────────────────────
      // Navigate to the dashboardUrl — this is the BUSINESS-USER view
      // (no canvas chrome, just the rendered widgets). It re-runs every
      // widget query against the saved Groovy + HTML, proving the export
      // round-trips. We assert widget counts but DO NOT screenshot here —
      // the docs' canvas hero is 300_90 above; this view is for verification
      // only.
      await page.goto(dashboardUrl);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });
      await page.waitForTimeout(2_000);

      // ───────────────────────────────────────────────────────────────────────
      // STEP 13 — Per-widget data-correctness assertions
      // ───────────────────────────────────────────────────────────────────────
      // Fetch each widget's saved data via the Reporting API and assert
      // sanity. THIS is what catches silent-data-bugs (e.g. a regression of
      // the Trend strftime/epoch-ms fix) immediately and with a meaningful
      // error message — instead of producing a misleading screenshot that
      // looks fine until a human spots the missing sparkline. Insertion
      // order matches getCanvasComponentIds output:
      //   number[0]=Revenue  number[1]=Orders  number[2]=Pareto
      //   trend[0]=Trend     chart[0]=Chart    tabulator[0]=Top10
      const numberIds = componentIds['number'] ?? [];
      const trendIds  = componentIds['trend']  ?? [];
      const chartIds  = componentIds['chart']  ?? [];
      const tabIds    = componentIds['tabulator'] ?? [];

      const fetchData = (cid: string) => page.evaluate(async ({ rc, c }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${c}`);
        return r.json();
      }, { rc: reportId, c: cid });

      // KPI 1 — Total Revenue (cube measure name "Revenue").
      const revData = await fetchData(numberIds[0]);
      console.log(`[ASSERT] revenue row: ${JSON.stringify(revData.data[0])}`);
      expect(Number(revData.data[0].Revenue)).toBeGreaterThan(0);

      // KPI 2 — Total Orders (cube measure name "OrderCount").
      const ordData = await fetchData(numberIds[1]);
      console.log(`[ASSERT] orders row: ${JSON.stringify(ordData.data[0])}`);
      expect(Number(ordData.data[0].OrderCount)).toBeGreaterThan(0);

      // KPI 3 — Pareto Share (Groovy emits "Top 20% Share" key).
      // Returned as a fraction in [0..1] (e.g. 0.36) so the rb-value "percent"
      // formatter can render "36%" via its `Math.round(num * 100)` rule.
      const parData = await fetchData(numberIds[2]);
      console.log(`[ASSERT] pareto row: ${JSON.stringify(parData.data[0])}`);
      const share = Number(parData.data[0]['Top 20% Share']);
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);

      // Trend — must produce many monthly buckets, NOT one big NULL group.
      // THIS is the assertion that catches the strftime/epoch-ms bug — if
      // Trend regresses to 1 row (broken date parsing), it fails here with
      // a meaningful message instead of producing a misleading screenshot.
      // Bounds: ≥6 months (any year-or-so of orders is enough for a real
      // sparkline) and ≤48 months (sanity upper bound — anything beyond a
      // few years of monthly buckets means our date format went wrong the
      // other way). The bundled Northwind sample is generated by
      // NorthwindDataGenerator.java around REFERENCE_DATE 2024-06-15 with
      // various `minusMonths(...)` offsets, so expect ~19 monthly rows.
      const trendData = await fetchData(trendIds[0]);
      console.log(`[ASSERT] trend rows=${trendData.data.length} first=${JSON.stringify(trendData.data[0])}`);
      expect(trendData.data.length).toBeGreaterThanOrEqual(6);
      expect(trendData.data.length).toBeLessThanOrEqual(48);
      expect(String(trendData.data[0].month)).toMatch(/^\d{4}-\d{2}$/);

      // Chart — 8 Northwind categories.
      const chartData = await fetchData(chartIds[0]);
      console.log(`[ASSERT] chart rows=${chartData.data.length}`);
      expect(chartData.data.length).toBe(8);

      // Tabulator — all bundled Northwind products. NorthwindDataGenerator
      // seeds exactly 20 products (prod1..prod20), each with its own
      // CategoryName, so grouping by ProductName + CategoryName produces 20
      // rows. (The full Northwind dataset has 77; we use a trimmed bundle.)
      // Sort order is alphabetical by ProductName because the cube generator
      // hardcodes ORDER BY <first_dim>; rb-tabulator's click-to-sort headers
      // recover the "leaderboard" UX at view time.
      const tabData = await fetchData(tabIds[0]);
      console.log(`[ASSERT] tab rows=${tabData.data.length} sample=${JSON.stringify(tabData.data[0])}`);
      expect(tabData.data.length).toBeGreaterThanOrEqual(15);
      expect(tabData.data.length).toBeLessThanOrEqual(80);

      console.log('[DONE] All Canvas dashboard screenshots + assertions complete.');
    } finally {
      // ── CLEANUP ──────────────────────────────────────────────────────────
      if (externalBrowser) {
        try {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        } catch (e) { console.error('Failed to close external browser:', e); }
      }
      try {
        console.log('[CLEANUP] Stopping AI Hub');
        await SelfServicePortalsTestHelper.stopApp(
          new FluentTester(firstPage).gotoDataCanvas(),
          AI_HUB_APP_ID,
        );
      } catch (e) { console.error('Failed to stop AI Hub:', e); }
      try {
        console.log('[CLEANUP] docker compose down — flowkraft/_ai-hub');
        SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
      } catch (e) { console.error('Failed to docker-compose down AI Hub:', e); }
    }
  },
);

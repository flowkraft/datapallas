// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Algo Trading blog post walkthrough
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures screenshots for the blog post:
//   "The Data Foundation of an Algo Trading Platform — 4 Layers, 12 Tables, 5 Dashboards"
//
// Five test blocks, each independently runnable (but Block 1 must run first
// to seed the TimescaleDB database that Blocks 2-4 query):
//
//   BLOCK 1 — Seed Data (connections Seed Data tab while script is running)
//   BLOCK 2 — Dashboard 1: Strategy Performance (equity curve + KPI tiles)
//   BLOCK 3 — Dashboard 2: Live Positions & Exposure
//   BLOCK 4 — Dashboard 3: Execution Quality
//   BLOCK 5 — Web Portal (all 3 dashboards available for viewer)
//
// Output PNGs (c:\Projects\kraft-src-company-biz\...\public\images\docs\):
//
//   010_seed-data-running.png
//   011_hey-ai-help-sql.png
//
//   020_d1-canvas-empty.png
//   021_d1-title-block.png
//   022_d1-strategy-runs-param.png
//   023_d1-total-pnl.png
//   024_d1-total-trades.png
//   025_d1-max-drawdown.png
//   026_d1-best-trade.png
//   027_d1-win-rate.png
//   028_d1-sharpe-ratio.png
//   029_d1-equity-curve.png
//   02a_d1-drawdown.png
//   02e_d1-published-single-strategy.png
//
//   030_d2-canvas-empty.png
//   031_d2-title.png
//   032_d2-positions-table.png
//   033_d2-gross-exposure.png
//   034_d2-net-exposure.png
//   035_d2-leverage.png
//   036_d2-sector-donut.png
//   037_d2-top5-winners.png
//   038_d2-top5-losers.png
//   039_d2-canvas-final.png
//
//   040_d3-canvas-empty.png
//   041_d3-title.png
//   042_d3-p50-latency.png
//   043_d3-p95-latency.png
//   044_d3-p99-latency.png
//   045_d3-fill-rate.png
//   046_d3-partial-rate.png
//   047_d3-rejected-rate.png
//   048_d3-slippage-histogram.png
//   049_d3-slowest20.png
//   04a_d3-worst-slippage.png
//   04b_d3-canvas-final.png
//   04c_d3-published.png
//
//   050_webportal-algo-dashboards.png
//
// HOW TO RUN (run Block 1 first — it seeds the database for Blocks 2-4):
//
//   cd frend/reporting
//   npx cross-env TEST_ENV=electron TEST_LICENSE_KEY=51b0aa18f2bbc066efdca8b53c2dacc8 ^
//     RUNNING_IN_E2E=true PORTABLE_EXECUTABLE_DIR=testground/e2e ^
//     playwright test -c e2e/playwright.config.ts ^
//     e2e/specs/screenshots/blog/algo-trading.screens.ts
//
//   Grep individual blocks:
//     --grep "Algo Trading — Seed Data"
//     --grep "Algo Trading — Dashboard 1"
//     --grep "Algo Trading — Dashboard 2"
//     --grep "Algo Trading — Dashboard 3"
//     --grep "Algo Trading — Web Portal"
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Browser, Page } from '@playwright/test';
import { spawnSync } from 'child_process';
import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import * as jetpack from 'fs-jetpack';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import { AppsTestHelper } from '../../../helpers/apps-test-helper';
import {
  createFreshCanvas,
  addTableToCanvas,
  addUIElement,
  arrangeAndHighlight,
  runSqlQuery,
  switchToWidget,
  addAggregation,
  addGroupBy,
  addVisualSort,
  addVisualFilter,
  bindVisualFilterToParam,
  setVisualLimit,
  hideTabulatorColumns,
  setChartType,
  setChartLegend,
  setChartTitle,
  setChartAxes,
  setChartDsl,
  setNumberLabel,
  setNumberFormat,
  setGaugeConfig,
  selectLastWidget,
  getLastWidgetId,
  waitForWidgetData,
  addFilterBarParam,
  publishDashboard,
  runVisualQuery,
  type GridPos,
} from '../../../helpers/explore-data-test-helper';
import {
  captureDocsScreenshot as _captureDocsScreenshot,
  captureDocsScreenshotFitToViewport as _captureDocsScreenshotFitToViewport,
  captureDocsScreenshotOfElement as _captureDocsScreenshotOfElement,
  captureDocsScreenshotOfElementWithHighlight as _captureDocsScreenshotOfElementWithHighlight,
  captureDocsScreenshotWithHighlight as _captureDocsScreenshotWithHighlight,
  captureDocsScreenshotWholeContent as _captureDocsScreenshotWholeContent,
  hideToastsForScreenshots,
  waitForRbChartsRendered,
  type HighlightSpec,
} from '../../../utils/docs-screenshot-helper';

// Algo-trading blog post screenshots live alongside the post under
// `public/images/blog/algo-trading/`, NOT in the generic `public/images/docs/`
// where unrelated docs screenshots accumulate.
//
// 7 `..` hops up from this file lands on `c:\Projects`:
//   blog → screenshots → specs → e2e → reporting → frend → reportburster
const ALGO_TRADING_IMAGES_DIR = path.resolve(
  __dirname,
  '..', '..', '..', '..', '..', '..', '..',
  'kraft-src-company-biz', 'flowkraft', 'www', 'reportburster.com',
  'public', 'images', 'blog', 'algo-trading',
);

// Every capture writes a `-dark.png` companion (the new dark-theme run)
// next to the original light `.png`, so the two themes can be compared
// before the dark set replaces the originals. One transform, applied in
// every wrapper below.
const darkName = (filename: string) => filename.replace(/\.png$/i, '-dark.png');

// Local wrappers that pre-bind ALGO_TRADING_IMAGES_DIR so every capture
// call in this spec writes to the blog-post folder without each call site
// having to repeat the path.
const captureDocsScreenshot = (page: Page, filename: string) =>
  _captureDocsScreenshot(page, darkName(filename), ALGO_TRADING_IMAGES_DIR);
const captureDocsScreenshotFitToViewport = (page: Page, filename: string) =>
  _captureDocsScreenshotFitToViewport(page, darkName(filename), ALGO_TRADING_IMAGES_DIR);
const captureDocsScreenshotWithHighlight = (page: Page, filename: string, spec: HighlightSpec) =>
  _captureDocsScreenshotWithHighlight(page, darkName(filename), spec, ALGO_TRADING_IMAGES_DIR);
const captureDocsScreenshotWholeContent = (
  page: Page,
  filename: string,
  options?: { containerSelector?: string; chromePadding?: number; highlight?: HighlightSpec },
) => _captureDocsScreenshotWholeContent(page, darkName(filename), ALGO_TRADING_IMAGES_DIR, options);
const captureDocsScreenshotOfElement = (
  page: Page,
  filename: string,
  selector: string,
  opts?: { targetWidth?: number },
) => _captureDocsScreenshotOfElement(page, darkName(filename), selector, {
  ...(opts ?? {}),
  outDir: ALGO_TRADING_IMAGES_DIR,
});
const captureDocsScreenshotOfElementWithHighlight = (
  page: Page,
  filename: string,
  elementSelector: string,
  highlightSelector: string,
  opts?: { targetWidth?: number; trimBottomEmpty?: boolean },
) => _captureDocsScreenshotOfElementWithHighlight(page, darkName(filename), elementSelector, highlightSelector, {
  ...(opts ?? {}),
  outDir: ALGO_TRADING_IMAGES_DIR,
});

// Helper: take a `_zoom.png` companion shot that captures `#canvasWorkArea`
// (canvas grid + right config panel) with the just-built widget highlighted.
// The shot's purpose is to show the reader (a) what the widget looks like in
// its actual grid position and (b) the configuration panel that produced it
// — both at once. The left tables panel is collapsed for the shot so the
// canvas + config row gets the maximum horizontal real estate.
//
// Idempotent: snapshots and restores left-panel open state + widget boxShadow.
async function captureWidgetZoom(
  page: Page,
  widgetId: string,
  filename: string,
): Promise<void> {
  // 1. Collapse the left tables panel if it's open.
  const leftCollapseBtn = page.locator('#btnCollapseLeftPanel');
  const leftWasOpen = await leftCollapseBtn.isVisible({ timeout: 500 }).catch(() => false);
  if (leftWasOpen) {
    await leftCollapseBtn.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500); // canvas grid reflow + Chart.js re-resize
  }

  // 2. Ring the widget the same way arrangeAndHighlight does, so the reader's
  // eye lands on the right cell. Saved & restored via a dataset attribute.
  await page.evaluate((id) => {
    const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
    if (!el) return;
    el.dataset.rbZoomPrevShadow = el.style.boxShadow ?? '';
    el.style.boxShadow = '0 0 0 4px #2563eb, 0 0 24px rgba(37, 99, 235, 0.45)';
  }, widgetId);
  await page.waitForTimeout(200);

  // 3. Capture the canvas + config-panel area as a single image.
  await captureDocsScreenshotOfElement(page, filename, '#canvasWorkArea');

  // 4. Restore the widget's original boxShadow.
  await page.evaluate((id) => {
    const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
    if (!el) return;
    el.style.boxShadow = el.dataset.rbZoomPrevShadow ?? '';
    delete el.dataset.rbZoomPrevShadow;
  }, widgetId);

  // 5. Re-open the left panel if we closed it, so subsequent test steps
  // (e.g. addTableToCanvas) find it where they expect.
  if (leftWasOpen) {
    await page.locator('#btnExpandLeftPanel').click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  console.log(`[capture] ${filename}`);
}

// Idempotent connection-setup. Blocks 2-5 run inside a `describe.serial` group
// with `skipCleanState: true`, so the TimescaleDB connection created by Block 1
// persists across them. Calling `createAndAssertNewDatabaseConnection` against
// an existing row would fail at the "save" step. This helper navigates to the
// Connections page, checks if the row already exists, and only creates when
// missing. For grep-running a single Dashboard block standalone, the cleanup
// did run so the row is absent and the helper creates as normal.
async function ensureDatabaseConnection(
  firstPage: Page,
  connectionName: string,
  dbVendor: string,
): Promise<void> {
  const connectionCode = `db-${_.kebabCase(connectionName)}-${dbVendor}`;
  await new FluentTester(firstPage).gotoConnections();
  const rowSelector = `#${connectionCode}\\.xml`;
  const exists = await firstPage
    .locator(rowSelector)
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
  if (exists) {
    console.log(`[SETUP] Connection "${connectionName}" already exists — skipping creation`);
    return;
  }
  await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
    new FluentTester(firstPage),
    connectionName,
    dbVendor,
  );
}

// Capture JUST the right config panel (`#configPanel`) — used to record the
// Display-tab state immediately after each set* helper applies its value, so
// the blog reader can see which tab and which fields they need to configure.
//
// Designed to be passed as the `captureBeforeReturn` callback to set* helpers
// (setNumberLabel, setNumberFormat, setChartType, setChartTitle, setChartLegend,
// setGaugeConfig). At that callback point the helper has just clicked Display
// tab and set the value — panel is naturally on Display, no extra clicks.
function captureConfigPanel(page: Page, filename: string): () => Promise<void> {
  return async () => {
    await captureDocsScreenshotOfElement(page, filename, '#configPanel', {
      trimBottomEmpty: true,
    });
  };
}

// Per-block screenshot cleanup. Called once at the very start of each block
// (Seed Data, D1, D2, D3) so stale PNGs from prior runs — including renamed/
// removed captures that would otherwise linger as orphans — get wiped before
// the block regenerates its set. Per-prefix scoping means grep-restricted
// runs only clear the block being rerun; outputs from other blocks stay put.
function clearBlogScreenshots(matching: string | string[]): void {
  const files = jetpack.find(ALGO_TRADING_IMAGES_DIR, { matching, recursive: false });
  for (const f of files) jetpack.remove(f);
  console.log(
    `[cleanup] removed ${files.length} stale screenshots matching ${
      Array.isArray(matching) ? matching.join(', ') : matching
    }`,
  );
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const DB_VENDOR = 'timescaledb';
const CONNECTION_NAME = 'AlgoTrader DB';
const TIMESCALE_CONN_CODE = `db-${_.kebabCase(CONNECTION_NAME)}-${DB_VENDOR}`;
const TIMESCALE_CONN_FILE_SEL = `#${TIMESCALE_CONN_CODE}\\.xml`;

const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
const VIEWPORT = { width: 1500, height: 900 };

// Full algo trader seed script — verbatim Appendix B from the blog post,
// read at test runtime from the test-resources directory. Creates the
// 12-table data model + 1 hypertable + 3 continuous aggregates + position_now
// view, then generates ~750k bars and 200 strategy runs (~70-90s on a 2024
// laptop). Block 1 waits for completion so Blocks 2-4 can query the data.
const ALGO_TRADER_SEED_SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../../_resources/screenshots/blog/algo-trader-seed.groovy'),
  'utf-8',
);

// Marker from the @description line at the top of the script — used to
// verify the paste landed in the codejar editor before we click Run.
const SEED_SCRIPT_MARKER = 'Algo Trader: 12-table data model';

// ── D1 SQL STRINGS ────────────────────────────────────────────────────────────

const SQL_D1_WIN_RATE = `SELECT
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END)::numeric
    / NULLIF(COUNT(*), 0) AS win_rate_pct
FROM trade
WHERE strategy_run_id IN (\${strategy_runs})`;

const SQL_D1_SHARPE = `WITH daily_returns AS (
  SELECT strategy_run_id,
         ts,
         (equity / NULLIF(LAG(equity) OVER (PARTITION BY strategy_run_id ORDER BY ts), 0)) - 1
           AS daily_return
  FROM equity_curve
  WHERE strategy_run_id IN (\${strategy_runs})
)
SELECT ROUND(
  ((AVG(daily_return) / NULLIF(STDDEV(daily_return), 0)) * SQRT(252))::numeric,
  2
) AS sharpe_ratio
FROM daily_returns
WHERE daily_return IS NOT NULL`;

// ── D3 SQL STRINGS ────────────────────────────────────────────────────────────

const SQL_D3_P50 = `SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms
FROM v_executions
WHERE latency_ms IS NOT NULL`;

const SQL_D3_P95 = `SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
FROM v_executions
WHERE latency_ms IS NOT NULL`;

const SQL_D3_P99 = `SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms
FROM v_executions
WHERE latency_ms IS NOT NULL`;

const SQL_D3_FILL_RATE = `SELECT 100.0 * COUNT(*) FILTER (WHERE status = 'filled')
     / NULLIF(COUNT(*), 0) AS pct
FROM "order"`;

const SQL_D3_PARTIAL_RATE = `SELECT 100.0 * COUNT(*) FILTER (WHERE status = 'partial')
     / NULLIF(COUNT(*), 0) AS pct
FROM "order"`;

const SQL_D3_REJECT_RATE = `SELECT 100.0 * COUNT(*) FILTER (WHERE status = 'rejected')
     / NULLIF(COUNT(*), 0) AS pct
FROM "order"`;

const SQL_D3_SLIPPAGE = `WITH bins AS (
  SELECT WIDTH_BUCKET(slippage_bps_signed, -12, 12, 40) AS b
  FROM v_executions
  WHERE slippage_bps_signed IS NOT NULL
    AND slippage_bps_signed BETWEEN -12 AND 12
    AND ABS(slippage_bps_signed) > 0.001
)
SELECT
  ROUND((-12 + (b - 0.5) * 0.6)::numeric, 2)::text AS bps_label,
  COUNT(*) AS n
FROM bins
GROUP BY b
ORDER BY b`;

// Minimal Groovy DSL for the slippage histogram chart. Load-bearing: without
// it the bar chart inherits the canvas-builder's "sort bars by count desc"
// default and the distribution shape collapses to a downward slope; with it
// the chart respects the SQL's `ORDER BY b` and the bins render in their
// numeric order, producing the bell-curve the blog post describes. Mirrors
// the block the MDX tells the reader to paste into the DSL editor.
const DSL_D3_SLIPPAGE = `chart {
  type 'bar'
  data {
    labelField 'bps_label'
    datasets {
      dataset {
        field 'n'
        label 'n'
      }
    }
  }
  options {
    plugins {
      legend { display false }
    }
  }
}`;

const SQL_D3_SLOWEST_20 = `SELECT
  symbol,
  side,
  qty_submitted AS qty,
  status,
  ROUND(latency_ms::numeric, 0) AS latency_ms,
  ROUND(slippage_bps_signed::numeric, 2) AS slippage_bps,
  signal_ts,
  first_fill_ts
FROM v_executions
WHERE latency_ms IS NOT NULL
ORDER BY latency_ms DESC
LIMIT 20`;

const SQL_D3_WORST_SLIPPAGE = `SELECT
  symbol,
  side,
  qty_submitted AS qty,
  status,
  ROUND(latency_ms::numeric, 0) AS latency_ms,
  ROUND(slippage_bps_signed::numeric, 2) AS slippage_bps,
  signal_ts,
  first_fill_ts
FROM v_executions
WHERE slippage_bps_signed IS NOT NULL
ORDER BY ABS(slippage_bps_signed) DESC
LIMIT 20`;

// ── LAYOUTS ───────────────────────────────────────────────────────────────────
// Widget insertion order matches layout array index.

// D1 layout — matches blog Phase 6.
// Title row → 6 KPI tiles in one row → Equity Curve full-width → Drawdown full-width.
// Title h=1 + KPIs h=1 keep the upper rows compact so charts get the vertical room.
// KPI widths sum to 12 with Total P&L wider (w=3) since "$432,409" is the longest
// value, and Sharpe Ratio narrower (w=1) since "0.46" is the shortest.
const D1_LAYOUT: GridPos[] = [
  { x: 0,  y: 0, w: 12, h: 1 }, // 0. Title
  { x: 0,  y: 1, w: 3,  h: 1 }, // 1. Total P&L         (widest — $432,409)
  { x: 3,  y: 1, w: 2,  h: 1 }, // 2. Total Trades
  { x: 5,  y: 1, w: 2,  h: 1 }, // 3. Max Drawdown
  { x: 7,  y: 1, w: 2,  h: 1 }, // 4. Best Trade
  { x: 9,  y: 1, w: 2,  h: 1 }, // 5. Win Rate %
  { x: 11, y: 1, w: 1,  h: 1 }, // 6. Sharpe Ratio      (narrowest — 0.46)
  { x: 0,  y: 2, w: 12, h: 4 }, // 7. Equity Curve
  { x: 0,  y: 6, w: 12, h: 4 }, // 8. Drawdown Ribbon
];

// D2 layout — matches blog "Final layout" ASCII PLUS the three Text-Block
// section headers that mdx Phase 3 / 6.1 / 6.2 explicitly call for.
//
// Visual grid (12 cols × 11 rows = 880px, fits in 900px viewport):
//
//   y=0   ┌───── Title (w=12 h=1) ─────┐
//   y=1   │  Gross  │  Net   │ Lever   │   (3 KPI tiles, h=3)
//   y=4   │ "Current Positions" │ Sec │   (header + donut start)
//   y=5   │   Positions table   │ tor │
//         │      (h=3)          │ Do  │
//         │                     │ nut │   (donut h=4 spans rows 4–7)
//   y=8   │ "Top 5 Winners" │ "Top 5 Losers" │
//   y=9   │   Winners (h=2) │   Losers (h=2) │
//
// Insertion order — matches NATURAL VISUAL TOP-DOWN BUILD: title, then the KPI
// row left-to-right, then the table+donut row, then the winners/losers row.
// canvas-store places new widgets at y=max(y+h), so adding in visual order
// keeps the intermediate (pre-arrangeWidgets) screenshots coherent and means
// any drag rearrangement a human user does after copying the test's flow is
// minimal.
//   0 Title
//   1 Gross Exposure gauge
//   2 Net Exposure number
//   3 Leverage gauge
//   4 "Current Positions" header (Text Block)
//   5 Current Positions table
//   6 Sector Donut chart
//   7 "Top 5 Winners" header (Text Block)
//   8 Top 5 Winners table
//   9 "Top 5 Losers" header (Text Block)
//  10 Top 5 Losers table
const D2_LAYOUT: GridPos[] = [
  { x: 0, y: 0, w: 12, h: 1 }, //  0. Title
  { x: 0, y: 1, w:  4, h: 3 }, //  1. Gross Exposure gauge
  { x: 4, y: 1, w:  4, h: 3 }, //  2. Net Exposure number
  { x: 8, y: 1, w:  4, h: 3 }, //  3. Leverage gauge
  { x: 0, y: 4, w:  8, h: 1 }, //  4. "Current Positions" header
  { x: 0, y: 5, w:  8, h: 3 }, //  5. Current Positions table
  { x: 8, y: 4, w:  4, h: 4 }, //  6. Sector Donut
  { x: 0, y: 8, w:  6, h: 1 }, //  7. "Top 5 Winners" header
  { x: 0, y: 9, w:  6, h: 2 }, //  8. Top 5 Winners table
  { x: 6, y: 8, w:  6, h: 1 }, //  9. "Top 5 Losers" header
  { x: 6, y: 9, w:  6, h: 2 }, // 10. Top 5 Losers table
];

// `v_positions_marked` has 18 columns. The blog wants only a subset visible
// per Tabulator widget; these lists are the ones to HIDE for each.
const D2_HIDE_COLS_POSITIONS = [
  'account_id', 'instrument_id', 'name', 'sector', 'currency', 'mark_ts',
  'unrealized_pnl_pct', 'net_value', 'gross_value', 'account_equity',
  'account_max_leverage',
]; // keeps: symbol, asset_class, net_qty, avg_cost, mark_price, unrealized_pnl, pct_of_portfolio
const D2_HIDE_COLS_TOP5 = [
  'account_id', 'instrument_id', 'name', 'asset_class', 'sector', 'currency',
  'avg_cost', 'mark_price', 'mark_ts', 'net_value', 'gross_value',
  'pct_of_portfolio', 'account_equity', 'account_max_leverage',
]; // keeps: symbol, net_qty, unrealized_pnl, unrealized_pnl_pct

// D3 layout — matches blog Phase 5 Final Layout ASCII.
// Insertion order (for arrangeAndHighlight slice indices):
//   0 Title, 1-6 six KPI tiles, 7 Slippage header text, 8 Slippage chart,
//   9 Slowest header text, 10 Slowest table, 11 Worst header text, 12 Worst table.
// Text-block headers carry each table/chart's title (consistent with D2's
// Top 5 Winners/Losers pattern — no per-widget Title input exists in the UI).
const D3_LAYOUT: GridPos[] = [
  { x: 0,  y: 0, w: 12, h: 1 }, // 0. Title
  { x: 0,  y: 1, w: 2,  h: 1 }, // 1. P50
  { x: 2,  y: 1, w: 2,  h: 1 }, // 2. P95
  { x: 4,  y: 1, w: 2,  h: 1 }, // 3. P99
  { x: 6,  y: 1, w: 2,  h: 1 }, // 4. Fill Rate
  { x: 8,  y: 1, w: 2,  h: 1 }, // 5. Partial Rate
  { x: 10, y: 1, w: 2,  h: 1 }, // 6. Rejected Rate
  { x: 0,  y: 2, w: 12, h: 1 }, // 7. Slippage header (text block)
  { x: 0,  y: 3, w: 12, h: 4 }, // 8. Slippage histogram
  { x: 0,  y: 7, w: 6,  h: 1 }, // 9. Slowest header (text block)
  { x: 0,  y: 8, w: 6,  h: 4 }, // 10. Slowest 20 table
  { x: 6,  y: 7, w: 6,  h: 1 }, // 11. Worst header (text block)
  { x: 6,  y: 8, w: 6,  h: 4 }, // 12. Worst 20 table
];


// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — Seed Data screenshot (Seed Data tab while script is running)
// ─────────────────────────────────────────────────────────────────────────────
//
// Creates the TimescaleDB connection, pastes the algo trader seed script into
// the My Script tab, clicks Run, and captures the screenshot while the script
// is initializing. The connection is NOT deleted in teardown — it stays alive
// for Blocks 2-4 to use the seeded data.

electronBeforeAfterAllTest(
  'Algo Trading — Seed Data screenshot',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Clear this block's stale screenshots (007/008/009/010/011*) so any
    // orphaned PNGs from previous runs don't linger in the docs folder.
    clearBlogScreenshots([
      '007*-dark.png', '008*-dark.png', '009*-dark.png', '010*-dark.png', '011*-dark.png',
    ]);

    try {
      // ── SHOWCASE: CloudBeaver as a complementary database UI ──────────────
      // Before the main algo-trader walkthrough, demonstrate that DataPallas
      // ships a CloudBeaver app (community edition database browser) the
      // reader can spin up alongside it. Same start → mid-flight capture →
      // stop pattern as the AI Hub block lower in this test.
      console.log('[Block 1] Starting CloudBeaver for "Starting"-state capture');
      const cloudbeaverBtn = '#btnStartStop_cloudbeaver';
      const cloudbeaverState = '#appState_cloudbeaver';
      await new FluentTester(firstPage)
        .gotoApps()
        .waitOnElementToBecomeVisible(cloudbeaverBtn)
        .waitOnElementToBecomeEnabled(cloudbeaverBtn)
        .click(cloudbeaverBtn)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled(cloudbeaverBtn)
        .waitOnElementToContainText(cloudbeaverState, 'starting', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      await hideToastsForScreenshots(firstPage);
      // Highlight the Launch button on the right so the reader's eye lands
      // on it — disabled while the state shows "Starting", but the ring
      // points to where they'll click once it flips to running.
      await captureDocsScreenshotWithHighlight(firstPage, '007_starting-cloudbeaver.png', {
        target: firstPage.locator('#btnLaunch_cloudbeaver'),
      });
      console.log('[capture] 007_starting-cloudbeaver.png');

      // Wait for CloudBeaver to finish starting, then stop it cleanly. This
      // block doesn't actually need CloudBeaver — it's purely a docs/marketing
      // screenshot. Issuing stopApp mid-"starting" would race the docker
      // compose up, so let it complete first.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled(cloudbeaverBtn, Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToContainText(cloudbeaverState, 'running', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      await AppsTestHelper.stopApp(new FluentTester(firstPage), 'cloudbeaver');

      // ── SETUP: Start TimescaleDB starter pack manually so we can capture a
      // screenshot WHILE the pack is in the transient "Starting" state.
      // We can't use setStarterPackStateForVendor as-is because it blocks until
      // "running" — instead we mirror its prefix here (navigate → search → click
      // Start → confirm), capture mid-flight, then wait for running.
      console.log('[SETUP] Starting TimescaleDB starter pack (with mid-flight capture)');
      const tsPackBtn = '#btnStartStop_db-timeseries-timescaledb';

      // Navigate + search once, then inline-probe the button text. A prior
      // failed/interrupted run can leave TimescaleDB running (Block 5 owns the
      // stop), in which case the toggle below would read "Stop" and our click
      // would stop the pack — then wait-for-"Starting" hangs. If we detect that
      // case, stop first (wait for label "Start"), then fall through to the
      // normal start chain.
      await new FluentTester(firstPage)
        .gotoStarterPacks()
        .setValue('#packSearch', 'timescaledb')
        .sleep(400)
        .waitOnElementToBecomeVisible(tsPackBtn)
        .waitOnElementToBecomeEnabled(tsPackBtn);

      const tsBtnText = (
        (await firstPage
          .locator(tsPackBtn)
          .textContent({ timeout: 5_000 })
          .catch(() => '')) || ''
      ).toLowerCase().trim();
      if (tsBtnText.includes('stop') && !tsBtnText.includes('start')) {
        console.log(`[Block 1] TimescaleDB pack is running (button="${tsBtnText}"); stopping first to avoid toggle ambiguity.`);
        await new FluentTester(firstPage)
          .click(tsPackBtn)
          .confirmDialogShouldBeVisible()
          .clickYesDoThis()
          .waitOnElementToHaveText(tsPackBtn, 'Start', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
          .waitOnElementToBecomeEnabled(tsPackBtn, Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      }

      await new FluentTester(firstPage)
        .click(tsPackBtn)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        // The button label flips to "Starting" the moment the start action is
        // accepted; capture during that visible-progress window.
        .waitOnElementToHaveText(tsPackBtn, 'Starting', Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      // ── CAPTURE: TimescaleDB starter pack in "Starting" state ─────────────
      // Hide toasts first so the transient start notification doesn't paint
      // over the spinner/button area we want to show.
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshot(firstPage, '008_starting-timescaledb.png');
      console.log('[capture] 008_starting-timescaledb.png');

      // Continue: wait until the pack finishes starting and reaches "running".
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled(tsPackBtn, Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToHaveText(tsPackBtn, 'Stop', Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      // ── SETUP: Create the TimescaleDB connection so the Seed Data tab is accessible.
      // A fresh user-created connection (not a sample) shows the full edit experience
      // the blog describes, without any "read-only" footer banner.
      console.log(`[SETUP] Creating ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        CONNECTION_NAME,
        DB_VENDOR,
      );

      // ── Open connection in Edit mode, test from Connection Details (default tab),
      // then navigate to Seed Data.
      // Starting TimescaleDB generates log output, so #btnTestDbConnection shows
      // an INFO dialog ("logs exist — please clear first"). Pattern from
      // reporting.spec.ts lines 1735-1750 (clearLogs=true):
      //   click test → infoDialog → OK → Clear Logs → confirm → OK →
      //   wait #btnClearLogsDbConnection disabled → green status →
      //   click test AGAIN → confirm-modal SHOWN → CAPTURE → clickYes → wait.
      await new FluentTester(firstPage)
        .gotoConnections()
        .waitOnElementToBecomeVisible(TIMESCALE_CONN_FILE_SEL)
        .clickAndSelectTableRow(TIMESCALE_CONN_FILE_SEL)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogsDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible();

      // ── CAPTURE: Test DB Connection confirm modal (Yes/No) ────────────────
      // Captures the moment after the second #btnTestDbConnection click, with
      // the confirm dialog asking "Do you want to test the connection?" still
      // visible. The blog uses this to show the user the confirm step.
      await captureDocsScreenshot(firstPage, '009_test-db-confirm.png');
      console.log('[capture] 009_test-db-confirm.png');

      // Continue: click Yes, wait for test to complete, navigate to Seed Data.
      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnTestDbConnection', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToBecomeEnabled('#btnTestDbConnection', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .sleep(Constants.DELAY_ONE_SECOND)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#tab-btn-seedDataTab')
        .waitOnElementToBecomeInvisible('#btnTestDbConnectionSeedData', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToBecomeVisible('#seedTemplateSelect');

      // ── Switch to My Script sub-tab and inject the seed script.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#tab-btn-seedTabMyScript')
        .click('#tab-btn-seedTabMyScript')
        .waitOnElementToBecomeVisible('#seedCustomScriptEditor')
        .setCodeJarContentSingleShot('#seedCustomScriptEditor', ALGO_TRADER_SEED_SCRIPT)
        .codeJarShouldContainText('#seedCustomScriptEditor', SEED_SCRIPT_MARKER);

      // Brief settle so the editor finishes syntax-highlighting the pasted content.
      await firstPage.waitForTimeout(1_500);

      // ── Click Run — the seed script starts executing asynchronously.
      // We capture the screenshot while the button is still disabled ("Running...")
      // and the progress log is streaming output. The seed initialisation phase
      // (DROP + CREATE + extensions) completes in ~2-3 s; the bar-generation phase
      // then runs for ~70 s. Capturing at t=2 s catches the clean "script started"
      // state the blog describes.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnRunCustomSeed')
        .click('#btnRunCustomSeed')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis();

      // Give the seed runner 2 s to start streaming log output so the UI shows
      // a live "running" state before we capture.
      await firstPage.waitForTimeout(2_000);

      // ── CAPTURE: Seed Data tab with script running
      // Captures: Connection Details modal open, Seed Data tab active, My Script
      // sub-tab visible, Groovy editor showing the seed script, and the Run
      // button disabled with progress streaming below it.
      await captureDocsScreenshot(firstPage, '010_seed-data-running.png');
      console.log('[capture] 010_seed-data-running.png');

      // Wait for the seed to finish so Blocks 2-4 have data. The full seed is
      // ~760k 1m bars (~90 s) + 200 strategy runs with full lifecycle (~120 s)
      // ≈ 4 min on standard hardware. Budget 10 min so the timeout never bites
      // before the work finishes — if it does, the finally block runs `docker
      // compose down` mid-INSERT and kills the half-populated database.
      console.log('[Block 1] Waiting for seed to complete (budget 10 min)…');
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnRunCustomSeed', 600_000);
      console.log('[Block 1] Seed complete — connection kept alive for Blocks 2-4.');

      // Close the Connection Details modal BEFORE attempting the graceful
      // starter-pack stop. The modal's PrimeNG p-dialog-mask intercepts every
      // pointer event globally, so the next step's hover('#topMenuHelp') would
      // retry for 30 s and time out. The finally block also closes the modal,
      // but only after the graceful-stop step has already failed.
      await firstPage.locator('#btnCloseDbConnectionModal').click();
      await firstPage.locator('#btnCloseDbConnectionModal')
        .waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});

      // ── CAPTURE: AI Hub app in "Starting" state ───────────────────────────
      // Show the user what the Self-Service Portal looks like while AI Hub is
      // booting up — same visual pattern as the TimescaleDB starter pack
      // "Starting" capture above. Mirrors the mid-flight chain from startApp
      // (lines 116-123 of self-service-portals-test-helper.ts): visible →
      // enabled → click → confirm → Yes → disabled → state contains 'starting'.
      console.log('[Block 1] Starting AI Hub for "Starting"-state capture');
      const aiHubBtn = `#btnStartStop_${AI_HUB_APP_ID}`;
      const aiHubState = `#appState_${AI_HUB_APP_ID}`;

      // Navigate + wait for the button to be ready, then inline-probe the
      // current state. If AI Hub was left running by a prior interrupted run
      // (Block 5 owns the stop), the toggle would read "Stop" and our click
      // would stop it — then wait-for-"starting" hangs. Stop first in that
      // case, then fall through to the normal start chain.
      await new FluentTester(firstPage)
        .gotoDataCanvas()
        .waitOnElementToBecomeVisible(aiHubBtn)
        .waitOnElementToBecomeEnabled(aiHubBtn);

      const currentAiHubState = (
        (await firstPage
          .locator(aiHubState)
          .textContent({ timeout: 5_000 })
          .catch(() => '')) || ''
      ).toLowerCase().trim();
      if (!currentAiHubState.includes('stopped')) {
        console.log(`[Block 1] AI Hub is '${currentAiHubState}'; stopping first to avoid toggle ambiguity.`);
        await AppsTestHelper.stopApp(new FluentTester(firstPage), AI_HUB_APP_ID);
      }

      await new FluentTester(firstPage)
        .click(aiHubBtn)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled(aiHubBtn)
        .waitOnElementToContainText(aiHubState, 'starting', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      await hideToastsForScreenshots(firstPage);
      // Highlight the Launch button (dropdown trigger for AI Hub's 2
      // launchLinks: "Explore Data" + "Chat2DB") so the reader's eye lands
      // on it. It's disabled while the state shows "Starting" — the
      // highlight points to where they'll click once the state flips to
      // "Stop" / "running".
      await captureDocsScreenshotWithHighlight(firstPage, '011_starting-ai-hub.png', {
        target: firstPage.locator(`#btnLaunch_${AI_HUB_APP_ID}`),
      });
      console.log('[capture] 011_starting-ai-hub.png');

      // Wait for AI Hub to finish starting — then LEAVE IT RUNNING for the
      // shared-state group (Blocks 2-5). They all need AI Hub + TimescaleDB up;
      // starting/stopping per block costs ~30-60s × N start cycles. Block 5
      // is responsible for the final stop on its happy path + finally.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled(aiHubBtn, Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToContainText(aiHubState, 'running', Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      console.log('[DONE] Seed Data screenshot captured. AI Hub + TimescaleDB left running for Blocks 2-5.');
    } finally {
      // Close the Connection Details modal so Blocks 2-5 navigate freely.
      // The connection itself is preserved (Blocks 2-5 need it).
      try {
        const modalCloseBtn = firstPage.locator('#btnCloseDbConnectionModal');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await firstPage.locator('#btnCloseDbConnectionModal')
            .waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        console.error('[CLEANUP] Failed to close modal:', e);
      }
      // AI Hub and TimescaleDB are intentionally NOT stopped here — they
      // remain alive for Blocks 2-5. Block 5's happy-path + finally are the
      // single point that tears them down.
      console.log(`[CLEANUP] Connection "${CONNECTION_NAME}" + AI Hub + TimescaleDB left alive for Blocks 2-5.`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SHARED-STATE GROUP — Blocks 2 through 5 run sequentially in the same worker
// without the per-test config/ wipe. This is what lets Block 5's Web Portal
// list show the 3 dashboards published by D1/D2/D3 — the published
// settings.xml/reporting.xml files live under config/reports/, which the
// default `restoreDocumentBursterCleanState` hook would otherwise empty between
// tests. `skipCleanState: true` opts these 4 tests out of that hook.
//
// `describe.serial` enforces declaration order and fails-fast: if D1 errors,
// D2/D3/Block 5 are skipped (Block 5 depends on the dashboards their
// predecessors published — no point running it on a broken upstream).
// ─────────────────────────────────────────────────────────────────────────────
electronBeforeAfterAllTest.describe.serial(
  'Algo Trading — Shared state (Dashboards + Web Portal)',
  () => {
    electronBeforeAfterAllTest.use({ skipCleanState: true });

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — Dashboard 1: Strategy Performance
// ─────────────────────────────────────────────────────────────────────────────
//
// Builds the Strategy Performance dashboard step by step and captures a
// screenshot at each stage: empty canvas → title block → equity curve chart
// → drawdown chart → 4 visual KPI numbers → 2 SQL KPI numbers → arranged
// canvas → published dashboard.

electronBeforeAfterAllTest(
  'Algo Trading — Dashboard 1: Strategy Performance',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Clear D1's stale screenshots (02*) so renamed/removed captures
    // from earlier runs don't linger as orphans in the docs folder.
    clearBlogScreenshots('02*-dark.png');

    let externalBrowser: Browser | null = null;

    try {
      // ── SETUP: Ensure the TimescaleDB connection exists.
      // Block 1 created the connection AND left TimescaleDB + AI Hub running;
      // ensureDatabaseConnection finds the existing row and skips creation.
      console.log(`[SETUP] Ensuring ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ensureDatabaseConnection(firstPage, CONNECTION_NAME, DB_VENDOR);

      // ── SETUP: External Chromium pointed at the running AI Hub on :8440.
      // AI Hub itself was started in Block 1 and is left running for the whole
      // shared-state group; we only need a fresh browser context per test.
      // 2x DPI for crisper screenshots — every page.screenshot() and
      // locator.screenshot() in this spec runs against this context, so both
      // in-context and zoom captures benefit. CSS pixels unchanged.
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser(
        false,
        { deviceScaleFactor: 2, viewport: VIEWPORT },
      );
      externalBrowser = browser;
      await page.setViewportSize(VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

      // ── Open a fresh canvas and bind the TimescaleDB connection. ──────────
      // Naming it "Algo Trader — Strategy Performance" matches the blog
      // tutorial's phase 1 instruction (renaming the canvas before adding widgets).
      await createFreshCanvas(page, DATA_CANVAS_URL, 'Algo Trader — Strategy Performance');
      const d1CanvasId = page.url().split('/').pop()!;
      console.log(`[SETUP] D1 canvasId: ${d1CanvasId}`);

      await page.locator('#selectConnection').selectOption(TIMESCALE_CONN_CODE);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(800);

      // ── CAPTURE 0: Empty canvas — highlight the dashboard NAME button so
      // a reader of the docs immediately sees what was just configured. The
      // canvas is otherwise empty; without the highlight ring the screenshot
      // looks like a blank page.
      await captureDocsScreenshotWithHighlight(page, '020_d1-canvas-empty.png', {
        target: page.locator('#btnCanvasName'),
      });
      console.log('[capture] 020_d1-canvas-empty.png');

      // ── STEP 1: Title block (H1, per blog Phase 1 step 7) ────────────────
      console.log('[D1 step 1] Adding title text block');
      await addUIElement(page, 'text', {
        textContent: '# Algo Trader — Strategy Performance',
      });
      await page.waitForTimeout(1_500);
      // Highlight the freshly-added Text Block widget — `selectLastWidget`
      // resolves the canvas-store-generated widget id, then we ring the
      // `#widget-<id>` element. This makes the "we just added a Text Block"
      // step crystal clear in the screenshot.
      await selectLastWidget(page);
      const d1TitleWidgetId = await getLastWidgetId(page);
      // Show the UI Elements tab in this screenshot so the blog reader sees
      // the panel they used to drop the Text Block in. `addUIElement` returns
      // to Data Source by default; switch back to Elements just for the
      // capture, then restore Data Source for subsequent steps.
      await page.click('#btnLeftTabElements');
      await page.waitForTimeout(300);
      await captureDocsScreenshotWithHighlight(page, '021_d1-title-block.png', {
        target: page.locator(`#widget-${d1TitleWidgetId}`),
      });
      console.log('[capture] 021_d1-title-block.png');
      await page.click('#btnLeftTabData');
      await page.waitForTimeout(300);

      // ── STEP 2: Strategy Runs multi-select parameter (Phase 5) ────────────
      // SQL-driven options: dropdown auto-populates from the seeded strategy_run table.
      // The query returns TWO columns — (id, label). RbParameters.wc.svelte's
      // loadOptions treats 2-column shape as [value, label] tuples: the dropdown
      // shows the friendly label, the IN-list binds receive only the raw id.
      // Label format: `<strategy.name> #<run_id> (<mode>)` — distinguishes
      // backtest vs paper vs live runs of the same strategy.
      // defaultValue '*' = wildcard "All" → backend rewrites IN (${strategy_runs}) to 1=1.
      // pageSize 5 paginates the dropdown 5 items at a time.
      console.log('[D1 step 2] Adding Strategy Runs multi-select parameter');
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'strategy_runs', type: String, label: 'Strategy Runs', defaultValue: '*') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'multiselect', options: \"SELECT sr.id, s.name || ' #' || sr.id || ' (' || sr.mode || ')' AS label FROM strategy_run sr JOIN strategy s ON s.id = sr.strategy_id ORDER BY sr.id\", pageSize: 5)\n" +
        "  }\n" +
        "}",
        // Capture the Dashboard Filters DSL dialog with the parameter DSL
        // pasted, just before Done is clicked. Full-viewport because the modal
        // is a centered overlay outside the right-side config panel.
        async () => {
          await captureDocsScreenshotFitToViewport(page, '022_d1-strategy-runs-param-dsl.png');
        },
      );
      // Highlight the new dashboard-filter bar so the reader sees exactly
      // where the parameter was applied. `#parameterBarContainer` is the
      // <div> that wraps the `<rb-parameters>` web component (added to
      // FilterBar.tsx specifically so this highlight call has a stable target).
      await captureDocsScreenshotWithHighlight(page, '022_d1-strategy-runs-param.png', {
        target: page.locator('#parameterBarContainer'),
      });
      console.log('[capture] 022_d1-strategy-runs-param.png');

      // ── STEP 3: Total P&L (Visual — SUM net_pnl, currency) ────────────────
      console.log('[D1 step 3] Adding Total P&L number');
      await addTableToCanvas(page, 'trade');
      await selectLastWidget(page);
      const widgetPnl = await getLastWidgetId(page);
      await addAggregation(page, 0, 'SUM', 'net_pnl');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetPnl);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Total P&L');
      await setNumberFormat(page, 'currency', captureConfigPanel(page, '023_d1-total-pnl-display.png'));
      const dispose3 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 2), widgetPnl);
      await dispose3();
      await captureWidgetZoom(page, widgetPnl, '023_d1-total-pnl.png');

      // ── STEP 4: Total Trades (Visual — COUNT id, bound to ${strategy_runs}) ─
      console.log('[D1 step 4] Adding Total Trades number');
      await addTableToCanvas(page, 'trade');
      await selectLastWidget(page);
      const widgetTrades = await getLastWidgetId(page);
      await addAggregation(page, 0, 'COUNT', 'id');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetTrades);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Total Trades', captureConfigPanel(page, '024_d1-total-trades-display.png'));
      const dispose4 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 3), widgetTrades);
      await dispose4();
      await captureWidgetZoom(page, widgetTrades, '024_d1-total-trades.png');

      // ── STEP 5: Max Drawdown (Visual — MIN drawdown_pct, percent) ─────────
      console.log('[D1 step 5] Adding Max Drawdown number');
      await addTableToCanvas(page, 'equity_curve');
      await selectLastWidget(page);
      const widgetMaxDD = await getLastWidgetId(page);
      await addAggregation(page, 0, 'MIN', 'drawdown_pct');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetMaxDD);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Max Drawdown');
      await setNumberFormat(page, 'percent', captureConfigPanel(page, '025_d1-max-drawdown-display.png'));
      const dispose5 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 4), widgetMaxDD);
      await dispose5();
      await captureWidgetZoom(page, widgetMaxDD, '025_d1-max-drawdown.png');

      // ── STEP 6: Best Trade (Visual — MAX net_pnl, currency) ───────────────
      console.log('[D1 step 6] Adding Best Trade number');
      await addTableToCanvas(page, 'trade');
      await selectLastWidget(page);
      const widgetBest = await getLastWidgetId(page);
      await addAggregation(page, 0, 'MAX', 'net_pnl');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetBest);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Best Trade');
      await setNumberFormat(page, 'currency', captureConfigPanel(page, '026_d1-best-trade-display.png'));
      const dispose6 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 5), widgetBest);
      await dispose6();
      await captureWidgetZoom(page, widgetBest, '026_d1-best-trade.png');

      // ── STEP 7: Win Rate % (Finetune SQL, ${strategy_runs} in WHERE) ──────
      console.log('[D1 step 7] Adding Win Rate number (Finetune SQL)');
      await addTableToCanvas(page, 'trade');
      await selectLastWidget(page);
      const widgetWin = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D1_WIN_RATE);
      await waitForWidgetData(page, widgetWin);
      // Standalone tip-screenshot: panel-scoped capture with the
      // "Hey AI, Help Me…" button highlighted, used in § 2 of the blog post
      // to introduce DataPallas's AI assistant for SQL/scripting. Captured
      // here because the Win Rate query is non-trivial CASE WHEN logic that
      // would feel intimidating to a SQL-shy reader — exactly the moment
      // the AI helper exists for.
      await captureDocsScreenshotOfElementWithHighlight(
        page,
        '011_hey-ai-help-sql.png',
        '#configPanel',
        '#btnAiHelpSql',
        { trimBottomEmpty: true },
      );
      console.log('[capture] 011_hey-ai-help-sql.png');
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Win Rate %');
      await setNumberFormat(page, 'percent', captureConfigPanel(page, '027_d1-win-rate-display.png'));
      const dispose7 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 6), widgetWin);
      await dispose7();
      await captureWidgetZoom(page, widgetWin, '027_d1-win-rate.png');

      // ── STEP 8: Sharpe Ratio (Finetune SQL with LAG window function) ──────
      console.log('[D1 step 8] Adding Sharpe Ratio number (Finetune SQL)');
      await addTableToCanvas(page, 'equity_curve');
      await selectLastWidget(page);
      const widgetSharpe = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D1_SHARPE);
      await waitForWidgetData(page, widgetSharpe);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Sharpe Ratio');
      await setNumberFormat(page, 'number', captureConfigPanel(page, '028_d1-sharpe-ratio-display.png'));
      const dispose8 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 7), widgetSharpe);
      await dispose8();
      await captureWidgetZoom(page, widgetSharpe, '028_d1-sharpe-ratio.png');

      // ── STEP 9: Equity Curve (Visual — AVG equity by ts/run, line) ────────
      console.log('[D1 step 9] Adding Equity Curve chart');
      await addTableToCanvas(page, 'equity_curve');
      await selectLastWidget(page);
      const widgetEquity = await getLastWidgetId(page);
      await addAggregation(page, 0, 'AVG', 'equity');
      await addGroupBy(page, 'ts');
      await addGroupBy(page, 'strategy_run_id');
      await addVisualSort(page, 0, 'ts', 'ASC');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetEquity);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'line');
      // Chart title — line / area charts in D1 have no Text Block header above
      // them (unlike D2's table headers); the title plugin renders inside the
      // chart frame so the reader knows what they're looking at without the
      // axes alone. Persists into `options.plugins.title.text` of the DSL.
      await setChartTitle(page, 'Equity Curve', captureConfigPanel(page, '029_d1-equity-curve-display.png'));
      const dispose9 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT.slice(0, 8), widgetEquity);
      await dispose9();
      await captureWidgetZoom(page, widgetEquity, '029_d1-equity-curve.png');

      // ── STEP 10: Drawdown Ribbon (Visual — AVG drawdown_pct by ts/run, area) ─
      console.log('[D1 step 10] Adding Drawdown chart');
      await addTableToCanvas(page, 'equity_curve');
      await selectLastWidget(page);
      const widgetDrawdown = await getLastWidgetId(page);
      await addAggregation(page, 0, 'AVG', 'drawdown_pct');
      await addGroupBy(page, 'ts');
      await addGroupBy(page, 'strategy_run_id');
      await addVisualSort(page, 0, 'ts', 'ASC');
      await addVisualFilter(page, 0, 'strategy_run_id', 'in');
      await bindVisualFilterToParam(page, 0, 'strategy_runs');
      await runVisualQuery(page);
      await waitForWidgetData(page, widgetDrawdown);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'area');
      await setChartTitle(page, 'Drawdown Ribbon', captureConfigPanel(page, '02a_d1-drawdown-display.png'));
      const dispose10 = await arrangeAndHighlight(page, d1CanvasId, D1_LAYOUT, widgetDrawdown);
      await dispose10();
      await captureWidgetZoom(page, widgetDrawdown, '02a_d1-drawdown.png');

      // ── PRE-PUBLISH POLISH — make the published-dashboard 02e screenshot
      // read clean. Two adjustments before publishing:
      //   (a) Filter to a SINGLE strategy run. The default `*` shows every
      //       run (~200 lines per chart) → busy/noisy. One run reads as a
      //       clean curve a reader can follow.
      //   (b) Collapse the right-side config panel via #btnCollapseRightPanel.
      //       That recovers ~300px of horizontal real estate so the dashboard
      //       fills the screenshot instead of being squeezed.
      // The published-dashboard capture inherits both because (a) is a saved
      // filter value and (b) is a render-only state that doesn't affect
      // publishing.

      // (a) Open the multi-select, clear `All`, pick run #1, click OK.
      //     `okMulti` (RbParameters.wc.svelte:399) commits the draft and fires
      //     `valueChange`; the canvas-store listens and re-queries every widget
      //     bound to ${strategy_runs} automatically. No separate Reload click is
      //     needed — and would in fact hang, because `#btnReloadDashboard` is
      //     gated on the `showReload` component prop which FilterBar.tsx does
      //     NOT pass (it's only used by the published-dashboard view, not the
      //     canvas builder).
      //     All targets are getElementById-style — RbParameters.wc.svelte
      //     exposes every needed control (cb_<id>, btnNone, btnOk).
      await page.locator('#strategy_runs').click();
      await page.locator('#strategy_runs_btnNone').click();
      await page.locator('#strategy_runs_cb_1').check();
      await page.locator('#strategy_runs_btnOk').click();
      // Wait for the cascade of widget re-queries to settle: 7 KPI tiles +
      // 2 charts × bound queries. networkidle with a generous 15s budget
      // covers the slowest (Sharpe LAG window function over equity_curve).
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2_500);

      // (b) Collapse the right config panel. The button is rendered by
      //     ConfigPanel.tsx; we wrap in a try because if the user clicked
      //     somewhere outside the canvas the panel may already be collapsed
      //     (and the button absent from the DOM). Best-effort.
      await page.locator('#btnCollapseRightPanel').click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);

      // ── Publish, then navigate to the published dashboard ────────────────
      const { dashboardUrl } = await publishDashboard(page);
      console.log(`[D1] Published → ${dashboardUrl}`);
      await page.goto(dashboardUrl);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await waitForRbChartsRendered(page, { timeout: 15_000 });

      // ── Apply the filter, then capture the single-strategy view ──────────
      // Only 02e is captured now — the intermediate "modal open" and the
      // busy-by-default 200-series shots were dropped from the post. The
      // published dashboard view DOES include `#btnReloadDashboard` /
      // `#btnConfirmReload` (the host passes `showReload=true` — unlike the
      // canvas builder which auto-reloads on valueChange). Same `getElementById`
      // selectors that RbParameters.wc.svelte exposes for the canvas builder
      // work here.
      console.log('[D1] Applying filter (single strategy) for 02e');
      await page.locator('#strategy_runs').click();
      await page.locator('#strategy_runs_btnNone').click();
      await page.locator('#strategy_runs_cb_1').check();
      await page.waitForTimeout(400);
      // Apply the selection: OK closes the modal, Reload+ConfirmReload triggers
      // the cascade of widget re-queries (each chart re-runs its SQL with the
      // new strategy_runs IN-list).
      await page.locator('#strategy_runs_btnOk').click();
      await page.locator('#btnReloadDashboard').click();
      await page.locator('#btnConfirmReload').click();
      // The published dashboard rebuilds every rb-* widget by replacing them
      // with fresh elements (see RbParameters.wc.svelte applyParamsToSiblings),
      // so wait for the cascade of fetches to settle.
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await waitForRbChartsRendered(page, { timeout: 15_000 });
      // 02e — whole dashboard, single strategy only, charts now readable.
      // Ring the parameter bar to draw the eye to the cause-and-effect: the
      // reader's gaze lands on "Strategy Runs: 1" at the top, then sees the
      // single clean line/area in each chart below.
      await captureDocsScreenshotWholeContent(page, '02e_d1-published-single-strategy.png', {
        highlight: { target: page.locator('#parameterBarContainer') },
      });
      console.log('[capture] 02e_d1-published-single-strategy.png');

      console.log('[DONE] D1 screenshots captured. AI Hub + TimescaleDB stay up for D2.');
    } finally {
      // Only the external Chromium needs to be torn down per test — AI Hub and
      // TimescaleDB are owned by Block 1 (start) and Block 5 (stop).
      if (externalBrowser) await externalBrowser.close().catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — Dashboard 2: Live Positions & Exposure
// ─────────────────────────────────────────────────────────────────────────────
//
// All widgets source from the `v_positions_marked` view (denormalised
// positions × latest bar × instrument × account). Point-and-click for every
// widget — no per-widget SQL. Eight widgets: title + positions table + KPI row
// (gross exposure gauge, net exposure number, leverage gauge) + sector donut
// + Top 5 Winners / Losers tabulators.

electronBeforeAfterAllTest(
  'Algo Trading — Dashboard 2: Live Positions & Exposure',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Clear D2's stale screenshots (03*) so renamed/removed captures
    // from earlier runs don't linger as orphans in the docs folder.
    clearBlogScreenshots('03*-dark.png');

    let externalBrowser: Browser | null = null;

    try {
      // ── SETUP: Ensure the TimescaleDB connection exists (idempotent within
      // the shared-state group; AI Hub + TimescaleDB are owned by Block 1).
      console.log(`[SETUP] Ensuring ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ensureDatabaseConnection(firstPage, CONNECTION_NAME, DB_VENDOR);

      // ── SETUP: External Chromium pointed at the already-running AI Hub.
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser(
        false,
        { deviceScaleFactor: 2, viewport: VIEWPORT },
      );
      externalBrowser = browser;
      await page.setViewportSize(VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

      await createFreshCanvas(page, DATA_CANVAS_URL, 'Algo Trader — Live Positions & Exposure');
      const d2CanvasId = page.url().split('/').pop()!;
      console.log(`[SETUP] D2 canvasId: ${d2CanvasId}`);

      await page.locator('#selectConnection').selectOption(TIMESCALE_CONN_CODE);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(800);

      // Empty canvas — highlight #btnCanvasName so the docs reader sees
      // what was just configured (matching the D1 pattern at 020).
      await captureDocsScreenshotWithHighlight(page, '030_d2-canvas-empty.png', {
        target: page.locator('#btnCanvasName'),
      });
      console.log('[capture] 030_d2-canvas-empty.png');

      // ── STEP 1: Title block (H1) ──────────────────────────────────────────
      console.log('[D2 step 1] Adding title text block');
      await addUIElement(page, 'text', {
        textContent: '# Algo Trader — Live Positions & Exposure',
      });
      await page.waitForTimeout(1_500);
      // Highlight the freshly-added Text Block widget so the reader instantly
      // sees what changed since 030 (matching the D1 pattern at 021).
      // General rule for per-step captures: ring the just-added widget, that's
      // the one the screenshot is meant to teach.
      await selectLastWidget(page);
      const d2TitleWidgetId = await getLastWidgetId(page);
      await captureDocsScreenshotWithHighlight(page, '031_d2-title.png', {
        target: page.locator(`#widget-${d2TitleWidgetId}`),
      });
      console.log('[capture] 031_d2-title.png');

      // ── STEP 2: Gross Exposure gauge ──────────────────────────────────────
      // SUM(gross_value) — absolute exposure (no sign). Higher = worse (risk
      // metric), so the band-color order is flipped via `higherIsWorse: true`.
      // Scale anchored to the seed:
      //   account.equity = $5M, account.max_leverage = 2.0
      //   → absolute max gross = 2 × equity = $10M
      //   → green ≤ 1× lev ($5M), yellow ≤ 1.5× ($7.5M), red ≤ 2× ($10M)
      // Mark-priced gross lands ~$5M, putting the needle right at the green/
      // yellow boundary — a "watch your size" reading, which is the point.
      console.log('[D2 step 2] Adding Gross Exposure gauge');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2GrossId = await getLastWidgetId(page);
      await addAggregation(page, 0, 'SUM', 'gross_value');
      await runVisualQuery(page);
      await waitForWidgetData(page, d2GrossId);
      await switchToWidget(page, 'gauge');
      await setGaugeConfig(page, {
        label: 'Gross Exposure',
        min: 0,
        max: 10_000_000,
        format: 'currency',
        bands: [5_000_000, 7_500_000, 10_000_000],
        higherIsWorse: true,
      }, captureConfigPanel(page, '032_d2-gross-exposure-display.png'));
      const d2Dispose2 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 2), d2GrossId);
      await d2Dispose2();
      await captureWidgetZoom(page, d2GrossId, '032_d2-gross-exposure.png');

      // ── STEP 3: Net Exposure number ───────────────────────────────────────
      // SUM(net_value) — signed exposure (long + short cancel). Number widget
      // (not Gauge) because gauges don't represent negatives cleanly.
      console.log('[D2 step 3] Adding Net Exposure number');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2NetId = await getLastWidgetId(page);
      await addAggregation(page, 0, 'SUM', 'net_value');
      await runVisualQuery(page);
      await waitForWidgetData(page, d2NetId);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Net Exposure');
      await setNumberFormat(page, 'currency', captureConfigPanel(page, '033_d2-net-exposure-display.png'));
      const d2Dispose3 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 3), d2NetId);
      await d2Dispose3();
      await captureWidgetZoom(page, d2NetId, '033_d2-net-exposure.png');

      // ── STEP 4: Leverage gauge ────────────────────────────────────────────
      // SUM(pct_of_portfolio) = total_gross / equity. Max 2× (typical retail
      // cap). Higher = worse (closer to limit) → band colors flipped.
      // The label includes "(× equity)" so a reader interpreting the rendered
      // "1.0" knows the unit — gauges don't render unit suffixes natively.
      console.log('[D2 step 4] Adding Leverage gauge');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2LevId = await getLastWidgetId(page);
      await addAggregation(page, 0, 'SUM', 'pct_of_portfolio');
      await runVisualQuery(page);
      await waitForWidgetData(page, d2LevId);
      await switchToWidget(page, 'gauge');
      await setGaugeConfig(page, {
        label: 'Leverage (× equity)',
        min: 0,
        max: 2,
        format: 'number',
        // 0..1× = green (under-leveraged), 1..1.5× = yellow (approaching cap),
        // 1.5..2× = red (at retail margin limit).
        bands: [1, 1.5, 2],
        higherIsWorse: true,
      }, captureConfigPanel(page, '034_d2-leverage-display.png'));
      const d2Dispose4 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 4), d2LevId);
      await d2Dispose4();
      await captureWidgetZoom(page, d2LevId, '034_d2-leverage.png');

      // ── STEP 5: "Current Positions" header (Text Block) ───────────────────
      // mdx Phase 4 step 3: "Drop a UI Element → Text Block, type Current
      // Positions. Resize to a thin header row."
      console.log('[D2 step 5] Adding "Current Positions" header');
      await addUIElement(page, 'text', { textContent: 'Current Positions' });
      await page.waitForTimeout(1_000);

      // ── STEP 6: Current Positions table ──────────────────────────────────
      // Drag v_positions_marked — DataPallas defaults a view to Table (tabulator).
      // No aggregation needed; the denormalised view already has one row per
      // (account_id, instrument_id) pair. Hide bookkeeping/duplicate columns
      // so the table reads as the trader's working view.
      console.log('[D2 step 6] Adding Current Positions table');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2PosId = await getLastWidgetId(page);
      await waitForWidgetData(page, d2PosId);
      await hideTabulatorColumns(page, D2_HIDE_COLS_POSITIONS, captureConfigPanel(page, '035_d2-positions-table-display.png'));
      const d2Dispose5 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 6), d2PosId);
      await d2Dispose5();
      await captureWidgetZoom(page, d2PosId, '035_d2-positions-table.png');

      // ── STEP 7: Sector Donut chart ────────────────────────────────────────
      // Group by sector + SUM(gross_value) → doughnut. Legend shown so each
      // sector slice is named — without it, a 6-slice donut is a Rorschach.
      console.log('[D2 step 7] Adding Sector Donut chart');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2SectorId = await getLastWidgetId(page);
      // Aggregation MUST be added before group-by — SummarizeStep only renders
      // the #btnGroupBy-* pills when summarize.length > 0.
      await addAggregation(page, 0, 'SUM', 'gross_value');
      await addGroupBy(page, 'sector');
      await runVisualQuery(page);
      await waitForWidgetData(page, d2SectorId);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'doughnut');
      await setChartLegend(page, 'show');
      // Chart title — same rationale as D1's Equity Curve / Drawdown Ribbon:
      // doughnut charts have no per-axis labels, so the title is the only
      // intrinsic identifier when the widget is viewed in isolation.
      await setChartTitle(page, 'Sector Exposure', captureConfigPanel(page, '036_d2-sector-donut-display.png'));
      const d2Dispose6 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 7), d2SectorId);
      await d2Dispose6();
      await captureWidgetZoom(page, d2SectorId, '036_d2-sector-donut.png');

      // ── STEP 8: "Top 5 Winners" header (Text Block) ──────────────────────
      // mdx Phase 6.1 step 5: "Drop a UI Element → Text Block above the table,
      // type Top 5 Winners."
      console.log('[D2 step 8] Adding "Top 5 Winners" header');
      await addUIElement(page, 'text', { textContent: 'Top 5 Winners' });
      await page.waitForTimeout(1_000);

      // ── STEP 9: Top 5 Winners ─────────────────────────────────────────────
      // v_positions_marked sorted by unrealized_pnl DESC, limit 5. Hide all
      // columns except symbol, net_qty, unrealized_pnl, unrealized_pnl_pct.
      console.log('[D2 step 9] Adding Top 5 Winners table');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2WinnersId = await getLastWidgetId(page);
      await addVisualSort(page, 0, 'unrealized_pnl', 'DESC');
      await setVisualLimit(page, 5);
      await runVisualQuery(page);
      await waitForWidgetData(page, d2WinnersId);
      await hideTabulatorColumns(page, D2_HIDE_COLS_TOP5, captureConfigPanel(page, '037_d2-top5-winners-display.png'));
      const d2Dispose7 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT.slice(0, 9), d2WinnersId);
      await d2Dispose7();
      await captureWidgetZoom(page, d2WinnersId, '037_d2-top5-winners.png');

      // ── STEP 10: "Top 5 Losers" header (Text Block) ──────────────────────
      // mdx Phase 6.2: "Header text block: Top 5 Losers."
      console.log('[D2 step 10] Adding "Top 5 Losers" header');
      await addUIElement(page, 'text', { textContent: 'Top 5 Losers' });
      await page.waitForTimeout(1_000);

      // ── STEP 11: Top 5 Losers ─────────────────────────────────────────────
      // Identical to Winners — sort direction ASC instead of DESC.
      console.log('[D2 step 11] Adding Top 5 Losers table');
      await addTableToCanvas(page, 'v_positions_marked');
      await selectLastWidget(page);
      const d2LosersId = await getLastWidgetId(page);
      await addVisualSort(page, 0, 'unrealized_pnl', 'ASC');
      await setVisualLimit(page, 5);
      await runVisualQuery(page);
      await waitForWidgetData(page, d2LosersId);
      await hideTabulatorColumns(page, D2_HIDE_COLS_TOP5, captureConfigPanel(page, '038_d2-top5-losers-display.png'));
      const d2Dispose8 = await arrangeAndHighlight(page, d2CanvasId, D2_LAYOUT, d2LosersId);
      await d2Dispose8();
      await captureWidgetZoom(page, d2LosersId, '038_d2-top5-losers.png');

      // ── PRE-CAPTURE POLISH for the final canvas screenshot ────────────────
      // (a) Collapse the right config panel — recovers ~300px of horizontal
      //     real estate so the dashboard fills the screenshot. Best-effort
      //     (button may be absent if the panel was already collapsed).
      // (b) Use captureDocsScreenshotWholeContent so the tall canvas (11 rows
      //     ≈ 880px content + chrome) fits in a single image without an
      //     internal scroll cropping the lower widgets — same fix as D1.
      await page.locator('#btnCollapseRightPanel').click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);

      // ── Final canvas (no widget highlight; final layout from step 11) ──
      // Fit-to-viewport (not whole-content) so charts render at the same
      // aspect ratio as the published dashboard would. Widgets below the
      // fold get clipped — acceptable: the blog uses this one canvas-final
      // shot and the per-widget zooms above.
      await captureDocsScreenshotFitToViewport(page, '039_d2-canvas-final.png');
      console.log('[capture] 039_d2-canvas-final.png');

      console.log('[DONE] D2 screenshots captured. AI Hub + TimescaleDB stay up for D3.');
    } finally {
      // Only the external Chromium needs to be torn down per test — AI Hub and
      // TimescaleDB are owned by Block 1 (start) and Block 5 (stop).
      if (externalBrowser) await externalBrowser.close().catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — Dashboard 3: Execution Quality
// ─────────────────────────────────────────────────────────────────────────────
//
// All widgets use Finetune SQL (PERCENTILE_CONT, COUNT FILTER, WIDTH_BUCKET
// and window functions can't be expressed by the Summarize UI). Ten widgets:
// title + 3 latency KPIs (P50/P95/P99) + 3 outcome-rate KPIs (fill/partial/
// reject) + slippage histogram + slowest-20 drill-down + worst-slippage drill-down.

electronBeforeAfterAllTest(
  'Algo Trading — Dashboard 3: Execution Quality',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Clear D3's stale screenshots (04*) so renamed/removed captures
    // from earlier runs don't linger as orphans in the docs folder.
    clearBlogScreenshots('04*-dark.png');

    let externalBrowser: Browser | null = null;

    try {
      // ── SETUP: Ensure the TimescaleDB connection exists (idempotent within
      // the shared-state group; AI Hub + TimescaleDB are owned by Block 1).
      console.log(`[SETUP] Ensuring ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ensureDatabaseConnection(firstPage, CONNECTION_NAME, DB_VENDOR);

      // ── SETUP: External Chromium pointed at the already-running AI Hub.
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser(
        false,
        { deviceScaleFactor: 2, viewport: VIEWPORT },
      );
      externalBrowser = browser;
      await page.setViewportSize(VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

      await createFreshCanvas(page, DATA_CANVAS_URL, 'Algo Trader — Execution Quality');
      const d3CanvasId = page.url().split('/').pop()!;
      console.log(`[SETUP] D3 canvasId: ${d3CanvasId}`);

      await page.locator('#selectConnection').selectOption(TIMESCALE_CONN_CODE);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(800);

      // Empty canvas screenshot — highlight the canvas-name input to point the
      // reader at the first action they'll take ("rename me").
      await captureDocsScreenshotWithHighlight(page, '040_d3-canvas-empty.png', {
        target: page.locator('#btnCanvasName'),
      });
      console.log('[capture] 040_d3-canvas-empty.png');

      // ── STEP 1: Title block (H1) ──────────────────────────────────────────
      console.log('[D3 step 1] Adding title text block');
      await addUIElement(page, 'text', {
        textContent: '# Algo Trader — Execution Quality',
      });
      await page.waitForTimeout(1_500);
      await selectLastWidget(page);
      const d3TitleWidgetId = await getLastWidgetId(page);
      await captureDocsScreenshotWithHighlight(page, '041_d3-title.png', {
        target: page.locator(`#widget-${d3TitleWidgetId}`),
      });
      console.log('[capture] 041_d3-title.png');

      // ── STEP 2: P50 Latency ───────────────────────────────────────────────
      // PERCENTILE_CONT(0.50) of signal→first-fill latency in ms. Median
      // "normal day" — baseline for P95/P99 alarms. Expected: 400-600 ms.
      console.log('[D3 step 2] Adding P50 Latency number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3P50Id = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_P50);
      await waitForWidgetData(page, d3P50Id);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Latency P50 (ms)', captureConfigPanel(page, '042_d3-p50-latency-display.png'));
      const d3Dispose2 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 2), d3P50Id);
      await d3Dispose2();
      await captureWidgetZoom(page, d3P50Id, '042_d3-p50-latency.png');

      // ── STEP 3: P95 Latency ───────────────────────────────────────────────
      // The "alarm bell" percentile. A jump from 200ms to 2000ms at P95
      // signals a network or broker-side issue worth investigating.
      console.log('[D3 step 3] Adding P95 Latency number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3P95Id = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_P95);
      await waitForWidgetData(page, d3P95Id);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Latency P95 (ms)', captureConfigPanel(page, '043_d3-p95-latency-display.png'));
      const d3Dispose3 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 3), d3P95Id);
      await d3Dispose3();
      await captureWidgetZoom(page, d3P95Id, '043_d3-p95-latency.png');

      // ── STEP 4: P99 Latency ───────────────────────────────────────────────
      // Worst-typical-day reading. Above ~5× P50 means occasional slow path.
      // Expected: ~1000 ms.
      console.log('[D3 step 4] Adding P99 Latency number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3P99Id = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_P99);
      await waitForWidgetData(page, d3P99Id);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Latency P99 (ms)', captureConfigPanel(page, '044_d3-p99-latency-display.png'));
      const d3Dispose4 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 4), d3P99Id);
      await d3Dispose4();
      await captureWidgetZoom(page, d3P99Id, '044_d3-p99-latency.png');

      // ── STEP 5: Fill Rate ─────────────────────────────────────────────────
      // % of orders with status='filled'. SQL pre-multiplies by 100; default
      // Number format renders 95.24 cleanly. Expected ~95.2%.
      console.log('[D3 step 5] Adding Fill Rate number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3FillId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_FILL_RATE);
      await waitForWidgetData(page, d3FillId);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Fill Rate %', captureConfigPanel(page, '045_d3-fill-rate-display.png'));
      const d3Dispose5 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 5), d3FillId);
      await d3Dispose5();
      await captureWidgetZoom(page, d3FillId, '045_d3-fill-rate.png');

      // ── STEP 6: Partial Fill Rate ─────────────────────────────────────────
      // Sustained >~5% means order sizes too aggressive for venue depth.
      // Expected ~2.9%.
      console.log('[D3 step 6] Adding Partial Fill Rate number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3PartialId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_PARTIAL_RATE);
      await waitForWidgetData(page, d3PartialId);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Partial Rate %', captureConfigPanel(page, '046_d3-partial-rate-display.png'));
      const d3Dispose6 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 6), d3PartialId);
      await d3Dispose6();
      await captureWidgetZoom(page, d3PartialId, '046_d3-partial-rate.png');

      // ── STEP 7: Rejected Order Rate ───────────────────────────────────────
      // First place to check when P&L diverges suddenly. Expected ~1.9%.
      console.log('[D3 step 7] Adding Rejected Rate number');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3RejectId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_REJECT_RATE);
      await waitForWidgetData(page, d3RejectId);
      await switchToWidget(page, 'number');
      await setNumberLabel(page, 'Rejected Rate %', captureConfigPanel(page, '047_d3-rejected-rate-display.png'));
      const d3Dispose7 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 7), d3RejectId);
      await d3Dispose7();
      await captureWidgetZoom(page, d3RejectId, '047_d3-rejected-rate.png');

      // ── STEP 8: "Slippage distribution" header (Text Block) ───────────────
      // mdx Phase 4 step 5: "Chart title: `Slippage distribution (bps)` — set
      // via a Text Block above the chart." Plain text — no `## ` markdown
      // prefix, matches D2's plain-text header convention.
      console.log('[D3 step 8] Adding "Slippage distribution (bps)" header');
      await addUIElement(page, 'text', { textContent: 'Slippage distribution (bps)' });
      await page.waitForTimeout(1_000);

      // ── STEP 9: Slippage Histogram bar chart ──────────────────────────────
      // WIDTH_BUCKET 40 bins across ±12 bps, signed (positive = bad).
      // setChartAxes pins X=bps_label / Y=n; setChartDsl is load-bearing —
      // it forces the chart to respect the SQL's `ORDER BY b` (bin-index)
      // ordering so the distribution renders as a bell. Without the DSL the
      // canvas-builder defaults to sorting bars by count desc, which makes
      // the chart look like a downward slope even when "Show all" is active.
      console.log('[D3 step 9] Adding Slippage histogram bar chart');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3SlippageId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_SLIPPAGE);
      await waitForWidgetData(page, d3SlippageId);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await setChartAxes(page, { x: 'bps_label', y: 'n' });
      await setChartTitle(page, 'Slippage Distribution (bps)');
      await setChartLegend(page, 'hide', captureConfigPanel(page, '048_d3-slippage-histogram-display.png'));
      // Apply the minimal Groovy DSL after the UI settings — this is the step
      // the MDX tells the reader to perform (Phase 4 step 6). It forces the
      // bar chart to render bins in `bps_label` order so the distribution
      // reads as a bell rather than a count-sorted downward slope.
      await setChartDsl(page, DSL_D3_SLIPPAGE);
      await page.waitForTimeout(500);
      const d3Dispose8 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 9), d3SlippageId);
      await d3Dispose8();
      // Click "Show all" on the slippage bar chart so the zoom shows the full
      // 40-bin distribution (in bps_label order) instead of the canvas-builder
      // default clipTopN view (20 bars sorted by count desc). Matches what the
      // published dashboard renders.
      await page.locator(`#widget-${d3SlippageId} button[title^="Show all bars"]`)
        .click({ timeout: 5_000 })
        .catch(() => {});
      await page.waitForTimeout(800);
      await captureWidgetZoom(page, d3SlippageId, '048_d3-slippage-histogram.png');

      // ── STEP 10: "Slowest 20 executions" header (Text Block) ──────────────
      // mdx Phase 5.1 step 3: "Chart title: `Slowest 20 executions` — set via
      // a Text Block above the table." Same pattern as D2's Top 5 Winners.
      console.log('[D3 step 10] Adding "Slowest 20 executions" header');
      await addUIElement(page, 'text', { textContent: 'Slowest 20 executions' });
      await page.waitForTimeout(1_000);

      // ── STEP 11: Slowest 20 Executions tabulator ──────────────────────────
      // SRE drill-down: "show me the slow ones." SQL has explicit columns and
      // LIMIT 20 — no setVisualLimit/hideTabulatorColumns needed.
      console.log('[D3 step 11] Adding Slowest 20 tabulator');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3Slow20Id = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_SLOWEST_20);
      await waitForWidgetData(page, d3Slow20Id);
      const d3Dispose9 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT.slice(0, 11), d3Slow20Id);
      await d3Dispose9();
      await captureWidgetZoom(page, d3Slow20Id, '049_d3-slowest20.png');

      // ── STEP 12: "Worst 20 slippage executions" header (Text Block) ───────
      // mdx Phase 5.2: same Text Block-above-table pattern as 5.1.
      console.log('[D3 step 12] Adding "Worst 20 slippage executions" header');
      await addUIElement(page, 'text', { textContent: 'Worst 20 slippage executions' });
      await page.waitForTimeout(1_000);

      // ── STEP 13: Worst 20 Slippage tabulator ──────────────────────────────
      // Strategy-author drill-down. ABS(slippage_bps_signed) DESC surfaces the
      // most-extreme slippage regardless of buy/sell direction.
      console.log('[D3 step 13] Adding Worst 20 tabulator');
      await addTableToCanvas(page, 'v_executions');
      await selectLastWidget(page);
      const d3WorstId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL_D3_WORST_SLIPPAGE);
      await waitForWidgetData(page, d3WorstId);
      const d3Dispose10 = await arrangeAndHighlight(page, d3CanvasId, D3_LAYOUT, d3WorstId);
      await d3Dispose10();
      await captureWidgetZoom(page, d3WorstId, '04a_d3-worst-slippage.png');

      // ── Final canvas: collapse right panel + fit-to-viewport capture ─────
      // Fit-to-viewport (not whole-content) so charts render at the same
      // aspect ratio as the published dashboard. Widgets below the fold
      // get clipped — the published-dashboard capture below shows the
      // complete picture.
      await page.locator('#btnCollapseRightPanel').click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);

      // The canvas builder auto-clips bar charts with > 20 rows to top-20 by
      // descending Y value (ChartWidget.tsx clipTopN). For the slippage
      // histogram this destroys the natural bps_label ordering and shows only
      // 20 of 40 bins — making the canvas-final screenshot look nothing like
      // the published version (which renders all bars in SQL order). Click the
      // widget's "Show all" footer button so the preview matches what the
      // reader will see in the published dashboard.
      await page.locator(`#widget-${d3SlippageId} button[title^="Show all bars"]`)
        .click({ timeout: 5_000 })
        .catch(() => {});
      await page.waitForTimeout(800);

      await captureDocsScreenshotFitToViewport(page, '04b_d3-canvas-final.png');
      console.log('[capture] 04b_d3-canvas-final.png');

      // ── Publish ───────────────────────────────────────────────────────────
      const { dashboardUrl: d3Url } = await publishDashboard(page);
      console.log(`[D3] Published → ${d3Url}`);
      await page.goto(d3Url);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await waitForRbChartsRendered(page, { timeout: 15_000 });
      await captureDocsScreenshotFitToViewport(page, '04c_d3-published.png');
      console.log('[capture] 04c_d3-published.png');

      console.log('[DONE] D3 screenshots captured. AI Hub + TimescaleDB stay up for Block 5.');
    } finally {
      // Only the external Chromium needs to be torn down per test — AI Hub and
      // TimescaleDB are owned by Block 1 (start) and Block 5 (stop).
      if (externalBrowser) await externalBrowser.close().catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — Web Portal: all 3 dashboards visible to viewers
// ─────────────────────────────────────────────────────────────────────────────
//
// Opens the CMS Web Portal tab in the Angular UI and captures the dashboard
// list showing all three published algo trader dashboards available to end users.

electronBeforeAfterAllTest(
  'Algo Trading — Web Portal: 3 dashboards available',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    try {
      // ── Navigate to the Self-Service Portals / Web Portal tab. ───────────
      // The CMS Web Portal tab shows all published dashboards in a list that
      // end-users can browse and open. After publishing D1, D2, and D3 in
      // Blocks 2-4, all three appear in this list. No TimescaleDB needed —
      // this block only reads the filesystem-backed dashboard list; the View
      // links are hyperlinks the test doesn't follow. The finally-block
      // `dockerComposeDownInDbFolder` is idempotent on an already-down stack.
      console.log('[Block 5] Navigating to CMS Web Portal tab');

      // Hide transient toasts before capture.
      await hideToastsForScreenshots(firstPage);

      // gotoDataCanvas() already opens the burger menu and clicks
      // #tab-btn-cmsWebPortalTab, then waits for #appPanel_flowkraft-data-canvas.
      // After this returns we're already on the CMS Web Portal tab — no inner
      // tab to navigate to.
      await new FluentTester(firstPage).gotoDataCanvas();

      // #btnRefreshDashboards is rendered as soon as the tab template mounts.
      // The list initially shows whatever dashboardReports was cached (e.g.
      // SalesDashboard/SalesPivotTable samples) — the 3 algo-trader dashboards
      // published in Blocks 2-4 only appear AFTER a refresh, since the tab
      // doesn't auto-refresh when external test contexts publish new ones.
      await firstPage.locator('#btnRefreshDashboards')
        .waitFor({ state: 'visible', timeout: 10_000 });
      await firstPage.locator('#btnRefreshDashboards').click();

      // Wait for at least one algo-trader View button to confirm the refresh
      // call returned a list including the newly published dashboards.
      await firstPage.locator('[id^="btnViewDashboard_algo-trader"]').first()
        .waitFor({ state: 'visible', timeout: 15_000 });

      // Brief settle so all three rows render before highlight.
      await firstPage.waitForTimeout(1_000);

      // ── CAPTURE: Web Portal showing 3 algo trader dashboards ─────────────
      // Shows: the CMS Web Portal tab active, a list of published dashboards
      // including "Algo Trader — Strategy Performance", "Algo Trader — Live
      // Positions & Exposure", and "Algo Trader — Execution Quality". Each
      // entry has a "View" link — the published URL end-users bookmark.
      // Highlight the FIRST row's View button so the reader's eye lands on
      // the action they'd take to open a published dashboard.

      // ── HAPPY-PATH STOP: gracefully tear down the services that Block 1
      // started and the whole shared-state group used. Goes through the UI so
      // the on-screen state correctly flips to "stopped".
      console.log('[Block 5] Happy-path stop — AI Hub then TimescaleDB');
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(firstPage).gotoApps(), AI_HUB_APP_ID,
      );
      await ConnectionsTestHelper.setStarterPackStateForVendor(
        new FluentTester(firstPage), 'timescaledb', 'stop',
      );
      console.log('[DONE] Web Portal screenshot captured. Services stopped via UI.');
    } finally {
      // ── NUCLEAR STOP: regardless of whether the happy-path stops above ran,
      // force-kill both stacks via `docker compose down`. Belt-and-suspenders
      // so a failed test doesn't leave containers/networks dangling for the
      // next run. We keep `removeVolumes: false` for TimescaleDB so a grep
      // rerun of a single Dashboard block still has the seeded ~750k bars.
      console.log('[Block 5] Nuclear stop — docker compose down for AI Hub + TimescaleDB');
      spawnSync('docker', ['compose', 'down'], {
        cwd: `${process.env.PORTABLE_EXECUTABLE_DIR}/_apps/flowkraft/_ai-hub`,
        shell: true,
      });
      ConnectionsTestHelper.dockerComposeDownInDbFolder(
        Constants.DELAY_FIVE_THOUSANDS_SECONDS, false,
      );
    }
  },
);

  }, // end of describe.serial callback (closes the shared-state group around Blocks 2-5)
);

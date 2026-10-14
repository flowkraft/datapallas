// ═══════════════════════════════════════════════════════════════════════════════
// canvas-mechanics.spec.ts
// One dedicated test per Canvas capability no Dashboard Demo exercises (M01–M31 and what the id
// coverage added after them), and one test that proves every defect fixed in TODO 5e (D01)
// (Phase C, section 9.7).
//
// Each test is independent: it makes its own canvas (`E2E mech Mnn <name>`) on the shipped DuckDB
// connection over `dash_demo`, never reads another test's canvas, and takes its canvas, and any
// report or share link it made, back in a `finally`. Each has both halves: the positive one (the
// capability does its job, asserted on content) and the negative one (the case where it must not act,
// or the error it must show). A user's path throughout: clicks, keys and drags on the real controls;
// the API is used only to read back what was stored, or to make the backend fail where a test says so.
//
// Controls are reached by their ids. Where the Canvas does something that looks wrong, the test
// asserts what it does today and the finding is in the RUN SUMMARY of C-rebuild-e2e.md.
//
// How to run (the owner does; written and type-checked, never run by the phase that wrote it):
//   E2E_SPEC='canvas-mechanics' bash asbl/ci/dp-ci.sh e2e
//   E2E_SPEC='canvas-mechanics' E2E_GREP='canvas mechanics\) M06' bash asbl/ci/dp-ci.sh e2e   (one capability)
//   E2E_SPEC='canvas-mechanics' E2E_GREP='canvas mechanics\) D01' bash asbl/ci/dp-ci.sh e2e   (the defect fixes)
//
// Needs the web components staged first: npm run custom:compile-and-stage-web-components.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  type Browser,
  type BrowserContext,
  type Download,
  expect,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import {
  Constants,
} from '../../utils/constants';
import {
  Helpers,
} from '../../utils/helpers';
import {
  addAggregation,
  addComputedColumn,
  addCubeToCanvas,
  addFilterBarParam,
  addGroupBy,
  addSlicer,
  addTableToCanvas,
  addUIElement,
  addVisualFilter,
  addVisualSort,
  applyCubeSelection,
  bindCubeMember,
  bindVisualFilterToParam,
  clickDataTab,
  clickDisplayTab,
  createFreshCanvas,
  getLastWidgetId,
  goToVisualTab,
  layoutWidgetsByDrag,
  openDslEditor,
  pickVisualCube,
  pickVisualTable,
  publishDashboard,
  runGroovyScript,
  runSqlQuery,
  runVisualQuery,
  selectLastWidget,
  setChartAxes,
  setChartType,
  setClicksFilter,
  setColumnTitle,
  setGaugeConfig,
  setGaugeField,
  setMapConfig,
  setNumberField,
  setProgressConfig,
  setSankeyFields,
  setTabulatorOptions,
  setTimeBucket,
  setTrendConfig,
  setVisualLimit,
  setWidgetDsl,
  switchToWidget,
  waitForWidgetData,
} from '../../helpers/explore-data-test-helper';
import {
  AI_HUB_APP_ID,
  AI_HUB_BASE_URL,
  CANVAS_LIST_URL,
  canvasIdOf,
  deleteCanvasViaUI,
  deleteReportAsAdmin,
  frozenRows,
  readCanvas,
  readShowSamples,
  selectConnectionByCode,
  SERVER_URL,
  setShowSamples,
  withFreshCanvas,
} from '../../helpers/dashboard-demos/canvas-mechanics-helper';
import {
  DASH_DEMO_CONNECTION,
} from '../../helpers/dashboard-demos/demo-catalog';
import {
  canvasComponentId,
  getCanvasComponentIds,
} from '../../helpers/dashboard-test-helper';
import {
  openPublished,
  reloadDashboard,
} from '../../helpers/dashboard-demos/published-dashboard-checks';
import {
  stateOf,
} from '../../helpers/dashboard-demos/canvas-parity';
import { dragPivotChip } from '../../helpers/dashboard-demos/recipe-runner';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { reseedDashDemoData, type AdminFetch } from '../../helpers/dashboard-demos-test-helper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = electronBeforeAfterAllTest as any;

const adminFetch: AdminFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

// ── Group A ─────────────────────────────────────────────────────────────────

/** What the server saved for a canvas: its name and the state (widgets, parametersConfig). */
async function aStored(page: Page, canvasId: string): Promise<Record<string, any>> {
  const canvas = await readCanvas(page, canvasId);
  return { name: canvas.name as string, ...JSON.parse((canvas.state as string) || '{}') };
}

/** Widgets with a header on the canvas (a divider has none). */
async function aWidgetCount(page: Page): Promise<number> {
  return page.locator('[id^="widgetHeader-"]').count();
}

/** Click a widget's header and wait until it is the selected one (its delete button only shows then). */
async function aSelectWidget(page: Page, widgetId: string): Promise<void> {
  await page.locator(`#widgetHeader-${widgetId}`).click();
  await page.locator(`#btnDeleteWidget-${widgetId}`).waitFor({ state: 'visible', timeout: 10_000 });
}

/** Rename the canvas as a person does: the name button, the box, Enter. */
async function aRenameCanvas(page: Page, name: string): Promise<void> {
  await page.locator('#btnCanvasName').click();
  await page.locator('#txtDashboardName').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#txtDashboardName').fill(name);
  await page.keyboard.press('Enter');
  await expect(page.locator('#txtDashboardName')).toHaveCount(0);
}

/** Wait until the autosave has put the canvas name on the server. */
async function aWaitStoredName(page: Page, canvasId: string, name: string): Promise<void> {
  await expect
    .poll(async () => (await aStored(page, canvasId)).name, { timeout: 20_000, intervals: [500] })
    .toBe(name);
}

/** A canvas made like `withFreshCanvas` makes it, but with NO connection picked yet: the state a brand-new canvas is in. */
async function aWithBareCanvas(page: Page, name: string, fn: (canvasId: string) => Promise<void>): Promise<void> {
  await createFreshCanvas(page, CANVAS_LIST_URL, name);
  const canvasId = canvasIdOf(page);
  try {
    await fn(canvasId);
  } finally {
    await deleteCanvasViaUI(page, canvasId);
  }
}

/** Click Undo until `done()` holds; returns how many clicks it took. Each click waits for the autosave to catch up. */
async function aUndoUntil(page: Page, done: () => Promise<boolean>, max = 10): Promise<number> {
  for (let clicks = 1; clicks <= max; clicks++) {
    await expect(page.locator('#btnCanvasUndo')).toBeEnabled();
    await page.locator('#btnCanvasUndo').click();
    await page.waitForTimeout(1_800); // 1.2 s autosave debounce + the save itself
    if (await done()) return clicks;
  }
  throw new Error(`Undo did not reach the wanted state in ${max} clicks`);
}

/** The first widget's chart type as saved. */
async function aStoredChartType(page: Page, canvasId: string): Promise<string | undefined> {
  const widgets = (await aStored(page, canvasId)).widgets as Array<Record<string, any>>;
  return widgets[0]?.displayConfig?.dslConfig?.type;
}

/** Drag a widget's header by (dx, dy) pixels with the real mouse. */
async function aDragHeader(page: Page, widgetId: string, dx: number, dy: number): Promise<void> {
  const box = await page.locator(`#widgetHeader-${widgetId}`).boundingBox();
  if (!box) throw new Error(`widget ${widgetId} has no header on screen`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 8 });
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

// ── Group B ─────────────────────────────────────────────────────────────────

/** The slug the server gives a canvas' first publish (CanvasExportService.slugify). */
function bSlug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s.substring(0, Math.min(50, s.length));
}

/** The digits of what a tile writes out ("5,234" -> "5234"). */
function bDigits(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

/** The status a GET answers on the DataPallas server, with the browser's own session. */
async function bStatusOf(page: Page, path: string): Promise<number> {
  const answer = await page.request.get(`${SERVER_URL}${path}`, { maxRedirects: 0 });
  return answer.status();
}

/** The rows a published widget answers with for some filter values. */
async function bData(
  page: Page,
  reportId: string,
  componentId: string,
  params: Record<string, string> = {},
): Promise<Array<Record<string, unknown>>> {
  const query = Object.entries(params)
    .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('');
  const answer = await page.request.get(
    `${SERVER_URL}/api/reports/${reportId}/data?componentId=${encodeURIComponent(componentId)}${query}`,
  );
  expect(answer.status(), `${reportId}/${componentId} answers its data call`).toBe(200);
  const body = await answer.json();
  return (body.data ?? body.rows ?? []) as Array<Record<string, unknown>>;
}

/** The one number a one-row, one-column answer holds. */
function bOnlyNumber(rows: Array<Record<string, unknown>>): number {
  expect(rows.length, 'a single-number widget answers one row').toBe(1);
  return Number(Object.values(rows[0])[0]);
}

/** A Number widget on `dash_demo.orders` from a SQL statement. */
async function bAddSqlNumber(page: Page, sql: string, field: string): Promise<void> {
  await addTableToCanvas(page, 'dash_demo.orders');
  await runSqlQuery(page, sql);
  await switchToWidget(page, 'number');
  await setNumberField(page, field);
}

/** A fresh canvas on the demo connection that the test itself deletes (the list tests delete it as their subject). */
async function bNewCanvas(page: Page, name: string): Promise<string> {
  await createFreshCanvas(page, CANVAS_LIST_URL, name);
  await selectConnectionByCode(page, DASH_DEMO_CONNECTION);
  return canvasIdOf(page);
}

/** Take a canvas back from the list if it is still there. */
async function bDeleteCanvasIfPresent(page: Page, canvasId: string | undefined): Promise<void> {
  if (!canvasId) return;
  await page.goto(CANVAS_LIST_URL);
  await page.waitForLoadState('networkidle');
  if ((await page.locator(`[id="btnDeleteCanvas-${canvasId}"]`).count()) > 0) {
    await deleteCanvasViaUI(page, canvasId);
  }
}

interface BParamSpec {
  label: string;
  type?: string;
  widget?: string;
  options?: string;
  defaultValue?: string;
  required?: boolean;
}

/**
 * Add the n-th filter (1-based) through the filters dialog's form. A new row starts as `param<n>`
 * and takes the label's slug as its id once a label is typed, so the other fields are reached by it.
 */
async function bAddParam(page: Page, n: number, spec: BParamSpec): Promise<string> {
  await page.locator('#btnConfigureFilters').click();
  await page.locator('#btnAddParameter').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnAddParameter').click();
  await page.locator(`#inputParamLabel-param${n}`).fill(spec.label);
  const id = spec.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (spec.type !== undefined) await page.locator(`#selectParamType-${id}`).selectOption(spec.type);
  if (spec.widget !== undefined) await page.locator(`#selectParamWidget-${id}`).selectOption(spec.widget);
  if (spec.options !== undefined) await page.locator(`#inputParamOptions-${id}`).fill(spec.options);
  if (spec.defaultValue !== undefined) await page.locator(`#inputParamDefault-${id}`).fill(spec.defaultValue);
  if (spec.required !== undefined) await page.locator(`#inputParamRequired-${id}`).setChecked(spec.required);
  await page.waitForTimeout(200);
  await page.locator('#btnDoneFilters').click();
  await page.waitForTimeout(1_500);
  await page.locator('#formReportParameters').waitFor({ state: 'visible', timeout: 10_000 });
  return id;
}

/** The ids of the parameters the server has saved for a canvas. */
async function bSavedParamIds(page: Page, canvasId: string): Promise<string[]> {
  const state = stateOf(await readCanvas(page, canvasId));
  return ((state.parametersConfig?.parameters ?? []) as Array<{ id: string }>).map((p) => p.id);
}

/** One order channel, and the filter DSL of a dashboard with one select over the channels. */
const B_CHANNEL = 'mobile_app';
const B_CHANNEL_FILTER_DSL = `reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT \\'\\' AS value, \\'-- All channels --\\' AS label UNION ALL SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label')
  }
}
`;
// One condition per line: a filter with no value is left out with the line that uses it, so "All channels" counts every order.
const B_CHANNEL_COUNT_SQL = 'SELECT count(*) AS orders FROM dash_demo.orders\nWHERE channel = ${channel}';

// ── Group C ─────────────────────────────────────────────────────────────────

/**
 * The numbers these five tests hold the Canvas to, counted in the rows the demo data is seeded from
 * (`frozenRows`: the shipped `orders.psv.gz` and `products.psv.gz`), never typed in. The data is re-seeded
 * for one fixed day before the suite, so they hold.
 */
const cOrders = frozenRows('orders');
const cProducts = frozenRows('products');
const cCount = (rows: Array<Record<string, string>>, column: string): Record<string, number> =>
  rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r[column]]: (n[r[column]] ?? 0) + 1 }), {});
const C_TRUTHS = {
  ORDERS: cOrders.length,
  PRODUCTS: cProducts.length,
  PRODUCT_CATEGORIES: Object.keys(cCount(cProducts, 'category')).length,
  CHANNELS: Object.keys(cCount(cOrders, 'channel')).sort(),
  ORDERS_BY_STATUS: cCount(cOrders, 'status'),
  TOP_N: 20, // TOP_N_DEFAULT of lib/explore-data/smart-defaults/rendering.ts
};

/** The visualisation element a widget draws (`rb-chart`, `rb-tabulator`, `rb-pivot-table`). */
const cViz = (page: Page, widgetId: string): Locator => page.locator(`[id="widgetViz-${widgetId}"]`);

interface CChartState {
  type: string;
  labels: string[];
  datasets: Array<{ label: string }>;
}

/** What a chart in the Canvas is drawing right now, from the Chart.js instance behind `<rb-chart>`. */
async function cReadChart(page: Page, widgetId: string): Promise<CChartState | null> {
  return cViz(page, widgetId).evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (el as any).getChartInstance?.();
    if (!chart) return null;
    return {
      type: String(chart.config.type),
      labels: (chart.data.labels ?? []).map(String),
      datasets: (chart.data.datasets ?? []).map((d: { label?: unknown }) => ({ label: String(d.label) })),
    };
  });
}

/** Wait until the chart satisfies `ok`, then hand back what it draws. */
async function cWaitChart(
  page: Page,
  widgetId: string,
  ok: (s: CChartState) => boolean,
  message: string,
): Promise<CChartState> {
  await expect
    .poll(async () => {
      const s = await cReadChart(page, widgetId);
      return s !== null && ok(s);
    }, { message, timeout: 30_000, intervals: [500] })
    .toBe(true);
  return (await cReadChart(page, widgetId)) as CChartState;
}

const cSame = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

interface CPivotState {
  state: { rows: string[]; cols: string[]; vals: string[]; aggregatorName: string; rendererName: string; rowOrder?: string; colOrder?: string };
  rowKeys: string[];
  colKeys: string[];
  /** `<row>::<col>` → the aggregated value of that cell. */
  cells: Record<string, number>;
}

/** What a pivot is computing: its state and every cell, from `<rb-pivot-table>`'s own PivotData. */
async function cReadPivot(locator: Locator): Promise<CPivotState | null> {
  return locator.evaluate((el) => {
    // On the Canvas the locator is the pivot itself (`widgetViz-<id>`); published, it is the pivot's
    // own box (`widgetPivot-<cid>`), inside the pivot's shadow root.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pivot = ((el.getRootNode() as ShadowRoot).host ?? el) as any;
    const data = pivot.getPivotData?.();
    if (!data) return null;
    const rowKeys: string[][] = data.getRowKeys();
    const colKeys: string[][] = data.getColKeys();
    const cells: Record<string, number> = {};
    // A pivot with rows only has no column keys: its cells are the row totals, under an empty column.
    for (const r of rowKeys) for (const c of colKeys.length ? colKeys : [[]]) cells[`${r.join('|')}::${c.join('|')}`] = Number(data.getAggregator(r, c).value());
    return { state: pivot.getState(), rowKeys: rowKeys.map((k) => k.join('|')), colKeys: colKeys.map((k) => k.join('|')), cells };
  });
}

async function cWaitPivot(
  locator: Locator,
  ok: (p: CPivotState) => boolean,
  message: string,
): Promise<CPivotState> {
  await expect
    .poll(async () => {
      const p = await cReadPivot(locator);
      return p !== null && ok(p);
    }, { message, timeout: 30_000, intervals: [500] })
    .toBe(true);
  return (await cReadPivot(locator)) as CPivotState;
}

/** The sum of a pivot's cells, for "the cells add up to the table's rows". */
const cSumCells = (p: CPivotState) => Object.values(p.cells).reduce((a, b) => a + b, 0);

/**
 * Drag a field chip into a pivot zone with the mouse, as a person does (dnd-kit's pointer sensor
 * needs a real press, a few moves and a release). `zone` is `rows`, `cols`, `vals` or `available`.
 * The chip is found where it is: in "Available fields", or already in a zone.
 */
async function cDragPivotField(page: Page, field: string, zone: 'rows' | 'cols' | 'vals' | 'available'): Promise<void> {
  await dragPivotChip(page, field, zone);
  await page.waitForTimeout(600);
}

/** Select a widget already on the canvas by clicking its header. */
async function cSelectWidget(page: Page, widgetId: string): Promise<void> {
  await page.locator(`[id="widgetHeader-${widgetId}"]`).click();
  await page.waitForTimeout(2_000);
}

/** A widget as the server stored it (the autosave has landed when this answers true). */
async function cStoredWidget(page: Page, canvasId: string, widgetId: string): Promise<Record<string, any> | undefined> {
  const saved = stateOf(await readCanvas(page, canvasId));
  return (saved.widgets as Array<Record<string, any>>).find((w) => w.id === widgetId);
}

/** The Tabulator options the Canvas handed `<rb-tabulator>`, and how many rows it holds. */
async function cReadTabulator(page: Page, widgetId: string): Promise<{ options: Record<string, any>; rows: number }> {
  return cViz(page, widgetId).evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = el as any;
    return { options: JSON.parse(JSON.stringify(t.options ?? {})), rows: (t.data ?? []).length };
  });
}

/** The number in a column's cell of the top row a table draws (`tabCell-<cid>-0-<field>`). */
async function cFirstRowCell(page: Page, componentId: string, field: string): Promise<number | null> {
  const cell = page.locator(`[id="tabCell-${componentId}-0-${field}"]`);
  if ((await cell.count()) === 0) return null;
  const n = Number(((await cell.textContent()) ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

/** Replace the DSL in the Display tab's slicer and stay there (no return to the Data tab). */
async function cTypeDslAndStay(page: Page, dsl: string): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(500);
  await openDslEditor(page);
  const editor = page.locator('#dslEditorInput');
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(dsl);
  await page.waitForTimeout(3_000);
}

// ── Group D ─────────────────────────────────────────────────────────────────

/** The channels the orders carry, counted in the rows the seed loads. */
const D_ORDER_CHANNELS = new Set(frozenRows('orders').map((o) => o.channel)).size;

/** The widgets the server has saved for a canvas, in canvas order. */
async function dStoredWidgets(page: Page, canvasId: string): Promise<Array<Record<string, any>>> {
  return stateOf(await readCanvas(page, canvasId)).widgets as Array<Record<string, any>>;
}

/** The "N rows returned" line under the query editor (the number of rows, read off the page). */
function dRowCount(page: Page) {
  return page.locator('#queryRowCount');
}

/** How many widgets are on the canvas right now. */
async function dWidgetCount(page: Page): Promise<number> {
  return page.locator('[id^="widgetHeader-"]').count();
}

/** The table buttons the schema browser lists, as ids. */
async function dListedTableIds(page: Page): Promise<string[]> {
  return page.locator('#schemaBrowserTablesList [id^="btnTable-"]').evaluateAll((els) => els.map((el) => el.id));
}

/** The sample connection's schema, as the server answers it (what the schema browser is drawn from). */
async function dSchemaOf(connectionCode: string): Promise<{ tables: Array<{ tableName: string; schemaName?: string; columns: Array<{ columnName: string; typeName: string }> }> }> {
  const response = await fetch(`${SERVER_URL}/api/queries/schema/${encodeURIComponent(connectionCode)}`, {
    headers: Helpers.apiKeyHeader(),
  });
  expect(response.status, 'the schema of the sample connection can be read').toBe(200);
  return response.json();
}

/** Open a Detail column's gear and fill the dialog: title, "Display as", decimals; then Done. */
async function dSetDetailColumn(
  page: Page,
  widgetId: string,
  field: string,
  settings: { title: string; viewAs: string; decimals: number },
): Promise<void> {
  const gear = page.locator(`[id="${widgetId}_btnColumnSettings-${field}"]`);
  await gear.waitFor({ state: 'visible', timeout: 15_000 });
  await gear.click();
  await page.locator('#txtColumnTitle').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#txtColumnTitle').fill(settings.title);
  await page.locator('#selectColumnViewAs').selectOption(settings.viewAs);
  const decimals = page.locator('#numColumnDecimals');
  await decimals.waitFor({ state: 'visible', timeout: 5_000 });
  await decimals.fill(String(settings.decimals));
  await page.waitForTimeout(300);
  await page.locator('#btnDoneColumnSettings').click();
  await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
  await page.waitForTimeout(300);
}

// ── Group E ─────────────────────────────────────────────────────────────────

/** `22060` as a pattern that reads it with or without thousands separators. */
function eNumberPattern(n: number): RegExp {
  return new RegExp(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',?'));
}

/** The rows the widget `<id>` was handed: the `data` of what it draws (`#widgetViz-<id>`). */
async function eWidgetRows(page: Page, widgetId: string): Promise<Array<Record<string, unknown>>> {
  let rows: Array<Record<string, unknown>> = [];
  await expect
    .poll(
      async () => {
        rows = await page.evaluate((id) => {
          const viz = document.getElementById(`widgetViz-${id}`) as (HTMLElement & { data?: unknown }) | null;
          const data = viz?.data;
          return Array.isArray(data) ? (JSON.parse(JSON.stringify(data)) as Array<Record<string, unknown>>) : [];
        }, widgetId);
        return rows.length;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0);
  return rows;
}

/** The first value of the first row, as a number. */
function eScalar(rows: Array<Record<string, unknown>>): number {
  return Number(Object.values(rows[0])[0]);
}

/** Everything the widget shows as text. */
async function eWidgetText(page: Page, widgetId: string): Promise<string> {
  return page.locator(`#widget-${widgetId}`).innerText();
}

/** A new widget on a `dash_demo` table, in the Visual tab; returns its id. */
async function eNewVisualWidget(page: Page, table: string): Promise<string> {
  await addTableToCanvas(page, `dash_demo.${table}`);
  const id = await getLastWidgetId(page);
  await page.locator('#btnQueryTab-visual').click();
  await page.waitForTimeout(500);
  return id;
}

interface EFilter { column: string; operator: string; value?: string; valueTo?: string }

/** How many rows of `table` pass the filters, counted by the Visual query itself (COUNT of `field`). */
async function eCountWhere(page: Page, table: string, field: string, filters: EFilter[]): Promise<number> {
  const id = await eNewVisualWidget(page, table);
  for (const [i, f] of filters.entries()) {
    await addVisualFilter(page, i, f.column, f.operator, f.value);
    if (f.valueTo !== undefined) await page.locator(`#inputFilterValueTo-${i}`).fill(f.valueTo);
  }
  await addAggregation(page, 0, 'COUNT', field);
  await runVisualQuery(page);
  return eScalar(await eWidgetRows(page, id));
}

/** One aggregate of `total_amount` over the orders, by the Visual query. */
async function eAggregateOf(page: Page, id: string, func: 'MIN' | 'MAX' | 'AVG'): Promise<number> {
  await page.locator('#selectAggFunc-0').selectOption(func);
  await page.waitForTimeout(300);
  await runVisualQuery(page);
  const rows = await eWidgetRows(page, id);
  // The old rows stay until the new answer lands: wait for the column of this aggregate.
  await expect
    .poll(async () => Object.keys((await eWidgetRows(page, id))[0]).join(','), { timeout: 20_000 })
    .toContain(func.toLowerCase());
  return eScalar(await eWidgetRows(page, id)) ?? eScalar(rows);
}

/** What the server saved for the widgets of a canvas, once the autosave has landed `until`. */
async function eStoredWidgets(
  page: Page,
  canvasId: string,
  until: (widgets: Array<Record<string, any>>) => boolean,
): Promise<Array<Record<string, any>>> {
  let widgets: Array<Record<string, any>> = [];
  await expect
    .poll(
      async () => {
        widgets = stateOf(await readCanvas(page, canvasId)).widgets as Array<Record<string, any>>;
        return until(widgets);
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toBe(true);
  return widgets;
}

/** The colour the first dataset of the chart `#widgetViz-<id>` is drawn with. */
async function eFirstDatasetColour(page: Page, widgetId: string): Promise<string> {
  const colour = await page.evaluate((id) => {
    const chart = document.getElementById(`widgetViz-${id}`) as
      (HTMLElement & { data?: { datasets?: Array<{ backgroundColor?: unknown }> } }) | null;
    const bg = chart?.data?.datasets?.[0]?.backgroundColor;
    return Array.isArray(bg) ? String(bg[0]) : String(bg ?? '');
  }, widgetId);
  return colour.toLowerCase();
}

/** Leaflet draws a region, a pin or a grid cell as one interactive path inside the widget's own box. */
async function eMapShapes(page: Page, widgetId: string): Promise<number> {
  // The map draws on a canvas, so its shapes are not elements; it writes their number on its container.
  const container = page.locator(`[id="widgetMap-${widgetId}"]`);
  if ((await container.count()) === 0) return 0;
  return Number((await container.getAttribute('data-shape-count')) ?? 0);
}

/** Pick Finetune → SQL or Script in the current widget. */
async function eOpenFinetune(page: Page, mode: 'sql' | 'script'): Promise<void> {
  await page.locator('#btnQueryTab-finetune').click();
  await page.waitForTimeout(500);
  await page.locator('#selectQueryMode').selectOption(mode);
  await page.waitForTimeout(300);
}

/** Build the prompt of the AI dialog open on the page and return it; the dialog is left open. */
async function eBuildAiPrompt(page: Page, requirement: string): Promise<string> {
  await page.locator('#txtAiRequirement').fill(requirement);
  await page.locator('#btnBuildPrompt').click();
  await expect(page.locator('#txtAiHelpPrompt'), 'the prompt is built').toHaveValue(/\S/, { timeout: 30_000 });
  return page.locator('#txtAiHelpPrompt').inputValue();
}

/** Build the prompt of the DSL help dialog open on the page and return it; the dialog is left open. */
async function eBuildDslPrompt(page: Page, requirement: string): Promise<string> {
  await page.locator('#txtDslRequirement').fill(requirement);
  await page.locator('#btnBuildDslPrompt').click();
  await expect(page.locator('#txtDslPrompt'), 'the DSL prompt is built').toHaveValue(/\S/, { timeout: 30_000 });
  return page.locator('#txtDslPrompt').inputValue();
}

async function eClipboardText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

// ── Group F ─────────────────────────────────────────────────────────────────

/** The ids of the widgets on the canvas, in the order they were added (their `widgetHeader-` ids). */
async function fWidgetIds(page: Page): Promise<string[]> {
  const headers = await page.locator('[id^="widgetHeader-"]').evaluateAll((els) => els.map((el) => el.id));
  return headers.map((id) => id.replace(/^widgetHeader-/, ''));
}

/** Select a widget the way a person does: click its header. */
async function fSelectWidget(page: Page, widgetId: string): Promise<void> {
  await page.locator(`[id="widgetHeader-${widgetId}"]`).click();
  await page.waitForTimeout(1_000);
}

/** A SQL widget shown as a table; returns its id. */
async function fAddTabulator(page: Page, table: string, sql: string): Promise<string> {
  await addTableToCanvas(page, table);
  await runSqlQuery(page, sql);
  await switchToWidget(page, 'tabulator');
  return getLastWidgetId(page);
}

/** What a table writes out, by the id of its element: `widgetViz-<id>` on the Canvas, `widgetTabulator-<cid>` published. */
async function fTabulatorText(page: Page, elementId: string): Promise<string> {
  const tile = page.locator(`[id="${elementId}"]`);
  await tile.waitFor({ state: 'visible', timeout: 30_000 });
  return tile.evaluate((el) => `${el.textContent ?? ''} ${el.shadowRoot?.textContent ?? ''}`);
}

/** Open a Tabulator column's gear and choose "Display as", then close the panel. */
async function fSetColumnViewAs(page: Page, gearId: string, viewAs: string): Promise<void> {
  await page.locator(`[id="${gearId}"]`).click();
  await page.locator('#selectColumnViewAs').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#selectColumnViewAs').selectOption(viewAs);
  await page.waitForTimeout(300);
  await page.locator('#btnDoneColumnSettings').click();
  await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
}

/** Open a saved canvas again, as a person does with the address bar, and wait for its widgets. */
async function fReopenCanvas(page: Page, canvasId: string, widgetId: string): Promise<void> {
  await page.goto(`${AI_HUB_BASE_URL}/explore-data/${canvasId}`);
  await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[id="widgetHeader-${widgetId}"]`).waitFor({ state: 'visible', timeout: 30_000 });
}

/** The canvas the server saved, its `state` read as the object it is. */
async function fSavedState(page: Page, canvasId: string): Promise<{ widgets: Array<Record<string, any>> }> {
  return JSON.parse((await readCanvas(page, canvasId)).state);
}

// ── Group G1 ─────────────────────────────────────────────────────────────────

/** A filter bar with a multi-select over 120 order ids (three pages of 50, 50, 20) and a radio over channels. */
const G1_FILTER_DSL = `reportParameters {
  parameter(id: 'pick', type: 'String', label: 'Pick') {
    constraints(required: false)
    ui(control: 'multiselect', options: 'SELECT DISTINCT CAST(order_id AS VARCHAR) AS value, CAST(order_id AS VARCHAR) AS label FROM dash_demo.orders ORDER BY 1 LIMIT 120')
  }
  parameter(id: 'mode', type: 'String', label: 'Mode') {
    constraints(required: false)
    ui(control: 'radio', options: 'SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY 1')
  }
}
`;

/** One select filter, so a published page has a filter bar and a reload button. */
const G1_SMALL_DSL = `reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY 1')
  }
}
`;

/** A Number widget on dash_demo.orders: a canvas that can be published. */
async function g1AddNumber(page: Page): Promise<void> {
  await addTableToCanvas(page, 'dash_demo.orders');
  await runSqlQuery(page, 'SELECT count(*) AS orders FROM dash_demo.orders');
  await switchToWidget(page, 'number');
  await setNumberField(page, 'orders');
}

/** The text of a multi-select's count label. */
async function g1Count(page: Page, id: string): Promise<string> {
  return (await page.locator(`#${id}_lblCount`).innerText()).trim();
}

/** Add an attribute row and fill its name and value. Returns the row's position, the suffix of its ids. */
async function g1AddAttr(page: Page, name: string, value: string): Promise<number> {
  const n = await page.locator('[id^="shareAttrName-"]').count();
  await page.locator('#btnAddShareAttribute').click();
  await expect(page.locator(`[id="shareAttrName-${n}"]`)).toBeVisible();
  await page.locator(`[id="shareAttrName-${n}"]`).fill(name);
  await page.locator(`[id="shareAttrValue-${n}"]`).fill(value);
  return n;
}

// ── Group G2 ─────────────────────────────────────────────────────────────────

/** The column settings the server saved for one field of the canvas's first widget (undefined when none). */
async function g2Stored(page: Page, canvasId: string, field: string): Promise<Record<string, any> | undefined> {
  return (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.columnSettings?.[field];
}

/** Open a column's gear, run `edit` on the open panel, then press Done and wait for the panel to go. */
async function g2Edit(page: Page, gearId: string, edit: () => Promise<void>): Promise<void> {
  const gear = page.locator(`[id="${gearId}"]`);
  await gear.waitFor({ state: 'visible', timeout: 15_000 });
  await gear.click();
  await page.locator('#panelColumnSettings').waitFor({ state: 'visible', timeout: 5_000 });
  await edit();
  await page.waitForTimeout(300);
  await page.locator('#btnDoneColumnSettings').click();
  await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
}

/** Wait until the table widget `<id>` writes out text that matches. */
async function g2TableShows(page: Page, widgetId: string, pattern: RegExp, message: string): Promise<void> {
  await expect.poll(() => fTabulatorText(page, `widgetViz-${widgetId}`), { message, timeout: 20_000 }).toMatch(pattern);
}

/** Wait until the table widget `<id>` no longer writes out text that matches. */
async function g2TableLacks(page: Page, widgetId: string, pattern: RegExp, message: string): Promise<void> {
  await expect.poll(() => fTabulatorText(page, `widgetViz-${widgetId}`), { message, timeout: 20_000 }).not.toMatch(pattern);
}

/** Open a gear, press the X, and wait for the panel to go (nothing is changed on the way). */
async function g2OpenAndClose(page: Page, gearId: string, how: 'x' | 'overlay'): Promise<void> {
  await page.locator(`[id="${gearId}"]`).click();
  await page.locator('#panelColumnSettings').waitFor({ state: 'visible', timeout: 5_000 });
  if (how === 'x') await page.locator('#btnCloseColumnSettings').click();
  else await page.locator('#overlayColumnSettings').click({ position: { x: 5, y: 5 } });
  await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
}

// ── Group G3 ─────────────────────────────────────────────────────────────────

/** The widget id of the divider on the canvas: the divider has no header, so `getLastWidgetId` cannot find it. */
async function g3DividerId(page: Page): Promise<string> {
  const holder = page.locator('[id^="widgetDivider-"]').first();
  await holder.waitFor({ state: 'visible', timeout: 15_000 });
  return (await holder.getAttribute('id'))!.replace('widgetDivider-', '');
}

/** A canvas row as the canvas list reads it (`state` is a JSON string). */
function g3FakeCanvas(): Record<string, unknown> {
  return { id: 'e2e-mech-m45-fake', name: 'E2E mech M45 fake', state: '{"widgets":[]}', updatedAt: new Date().toISOString() };
}

/** Answer the canvas list (GET /explorations) with `rows`; every other call (create, delete) goes through. */
async function g3AnswerCanvasList(page: Page, rows: unknown[]): Promise<void> {
  await page.route(/\/explorations$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
}

// ── Group G4 ─────────────────────────────────────────────────────────────────

// Spec-level helpers used from the other groups: eNewVisualWidget, eWidgetRows, eScalar, eStoredWidgets,
// cDragPivotField.

/** The rows the widget has once `ok` holds for them (the old rows stay until the new answer lands). */
async function g4RowsWhere(
  page: Page,
  widgetId: string,
  ok: (rows: Array<Record<string, unknown>>) => boolean,
  message: string,
): Promise<Array<Record<string, unknown>>> {
  let rows: Array<Record<string, unknown>> = [];
  await expect
    .poll(
      async () => {
        rows = await eWidgetRows(page, widgetId);
        return ok(rows);
      },
      { message, timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
  return rows;
}

/** The aggregate of a one-value widget, once it equals `expected`. */
async function g4ScalarIs(page: Page, widgetId: string, expected: number, message: string): Promise<void> {
  await expect
    .poll(async () => eScalar(await eWidgetRows(page, widgetId)), { message, timeout: 30_000, intervals: [500] })
    .toBe(expected);
}

/** The query builder's "N rows returned" line. */
const g4RowCount = (page: Page) => page.locator('#queryRowCount');

/** `sum(field)` of the frozen rows per value of `by`, sorted ascending. */
function g4SumBy(rows: Array<Record<string, string>>, by: string, field: string): number[] {
  const sums: Record<string, number> = {};
  for (const r of rows) sums[r[by]] = (sums[r[by]] ?? 0) + Number(r[field]);
  return Object.values(sums).sort((a, b) => a - b);
}

/** The radius of every bubble the chart of a widget draws, sorted ascending. */
async function g4Radii(page: Page, widgetId: string): Promise<number[]> {
  const radii = await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (document.getElementById(`widgetViz-${id}`) as any)?.getChartInstance?.();
    const points: Array<{ r?: number }> = chart?.data?.datasets?.[0]?.data ?? [];
    return points.map((p) => Number(p.r));
  }, widgetId);
  return radii.sort((a, b) => a - b);
}

/** Whether the bars of a widget's chart stack, and how many series it draws. */
async function g4ChartStack(page: Page, widgetId: string): Promise<{ stacked: boolean; series: number }> {
  return page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (document.getElementById(`widgetViz-${id}`) as any)?.getChartInstance?.();
    return {
      stacked: chart?.options?.scales?.y?.stacked === true,
      series: (chart?.data?.datasets ?? []).length,
    };
  }, widgetId);
}

/** The first colour of the palette the Sankey of a widget was handed (`<rb-sankey>`'s own options). */
async function g4SankeyColour(page: Page, widgetId: string): Promise<string> {
  const colour = await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (document.getElementById(`widgetViz-${id}`) as any)?.options;
    return String(options?.palette?.[0] ?? '');
  }, widgetId);
  return colour.toLowerCase();
}

// ── Group G5 ─────────────────────────────────────────────────────────────────

/** What the pivot tests below are held to, counted in the seeded rows (`frozenRows`), never typed in. */
const g5Orders = frozenRows('orders');
const g5Distinct = (column: string): string[] => [...new Set(g5Orders.map((r) => r[column]))].sort();
const g5Statuses = g5Distinct('status');
const g5Channels = g5Distinct('channel');

/** The same token the pivot puts in the ids of its controls (RbPivotTable `pvtIdToken`). */
const g5Token = (v: unknown): string => String(v).replace(/[^A-Za-z0-9_-]+/g, '_');

/** Orders per `<status>::<channel>` cell, optionally only for some statuses. */
function g5Counts(statuses: string[] = g5Statuses): Record<string, number> {
  const n: Record<string, number> = {};
  for (const s of statuses) for (const c of g5Channels) n[`${s}::${c}`] = 0;
  for (const r of g5Orders) if (statuses.includes(r.status)) n[`${r.status}::${r.channel}`] += 1;
  return n;
}

/** total_amount summed per `<status>::<channel>` cell. */
function g5Sums(statuses: string[] = g5Statuses): Record<string, number> {
  const n: Record<string, number> = {};
  for (const s of statuses) for (const c of g5Channels) n[`${s}::${c}`] = 0;
  for (const r of g5Orders) if (statuses.includes(r.status)) n[`${r.status}::${r.channel}`] += Number(r.total_amount);
  return n;
}

/** Orders per value of one column (what a "by value" sort orders the keys by). */
const g5Totals = (column: string): Record<string, number> =>
  g5Orders.reduce<Record<string, number>>((n, r) => ({ ...n, [r[column]]: (n[r[column]] ?? 0) + 1 }), {});

const g5NonDecreasing = (keys: string[], totals: Record<string, number>, desc = false): boolean =>
  keys.every((k, i) => i === 0 || (desc ? totals[keys[i - 1]] >= totals[k] : totals[keys[i - 1]] <= totals[k]));

/** Every cell of `p` equals `truth` (a missing truth cell is 0; Sum cells compared to 2 decimals). */
function g5ExpectCells(p: CPivotState, truth: Record<string, number>, what: string): void {
  for (const [cell, value] of Object.entries(p.cells)) {
    expect(value, `${what}: ${cell}`).toBeCloseTo(truth[cell] ?? 0, 2);
  }
}

/**
 * `g5ExpectCells` as a yes or no, for a wait: a published pivot counts on the server, so after the
 * reader changes the aggregator or the value field its cells keep the old numbers until the answer
 * arrives, and only then are they worth checking.
 */
const g5CellsMatch = (p: CPivotState, truth: Record<string, number>): boolean =>
  Object.entries(p.cells).every(([cell, value]) => Math.abs(value - (truth[cell] ?? 0)) < 0.005);

/**
 * Build the pivot the reader tests need (rows = status, columns = channel, Count, no value field),
 * publish the dashboard and open it. Hands back the pivot element and the prefix of its control ids.
 */
async function g5PublishPivot(
  page: Page,
  canvasId: string,
): Promise<{ reportId: string; pivot: Locator }> {
  await addTableToCanvas(page, 'dash_demo.orders');
  await runSqlQuery(page, 'SELECT status, channel, total_amount FROM dash_demo.orders');
  await switchToWidget(page, 'pivot');
  await setWidgetDsl(page, [
    'pivotTable {',
    "  rows(['status'])",
    "  cols(['channel'])",
    '  vals([])',
    "  aggregatorName 'Count'",
    "  rendererName 'Table'",
    '}',
    '',
  ].join('\n'));
  const cid = (await getCanvasComponentIds(page, canvasId)).pivot[0];
  const published = await publishDashboard(page);
  await openPublished(page, published.reportId);
  const pivot = page.locator(`[id="widgetPivot-${cid}"]`);
  await expect(pivot, 'the published pivot is on the page').toBeVisible({ timeout: 60_000 });
  await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses) && cSame(x.colKeys, g5Channels),
    'the published pivot counts orders per status and channel');
  return { reportId: published.reportId, pivot };
}

// ── Group P ─────────────────────────────────────────────────────────────────

/** The seeded orders — the same frozen rows the pivot group reads, and the truth these numbers
 *  come from: a slicer's effect is counted in the file the database was filled from. */
const pOrders = g5Orders;
const pCount = (ok: (r: Record<string, string>) => boolean): number => pOrders.filter(ok).length;
const pChannels = g5Channels;
/** The devices the orders really ship on (a sales_rep order has none, and a slicer lists no NULL). */
const pDevices = [...new Set(pOrders.map((r) => r.device))].filter((d) => d !== '').sort();
/** The devices one channel ships on: `mobile_app` only ships on a phone, which is what makes a
 *  grey-out worth asserting - the other devices are excluded by that one pick. */
const pDevicesOf = (channel: string): string[] =>
  [...new Set(pOrders.filter((r) => r.channel === channel).map((r) => r.device))].filter((d) => d !== '').sort();
/** Every channel-and-device pair the orders hold: the rows a query grouped by both answers. */
const pPairs = [...new Set(pOrders.map((r) => `${r.channel}/${r.device}`))];
/** Orders per channel, for the rows a chart grouped by channel is handed. */
function pPerChannel(ok: (r: Record<string, string>) => boolean = () => true): Record<string, number> {
  const n: Record<string, number> = {};
  for (const r of pOrders) if (ok(r)) n[r.channel] = (n[r.channel] ?? 0) + 1;
  return n;
}

/** A value as `rb-slicer` writes it into its own ids (its `safeId`). */
const pSafeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');

/** One value of one slicer, by its own id (the slicer's id is the widget's). */
const pValue = (page: Page, slicer: string, value: string): Locator =>
  page.locator(`[id="slicerValue-${slicer}-${pSafeId(value)}"]`);

/** Pick a value, or drop it again: one click on the value, the way a reader does it. */
async function pClick(page: Page, slicer: string, value: string): Promise<void> {
  await pValue(page, slicer, value).click();
  await page.waitForTimeout(500);
}

/** Wait until the rows a widget was handed satisfy `ok`, then hand them back. */
async function pWaitRows(
  page: Page,
  widgetId: string,
  ok: (rows: Array<Record<string, unknown>>) => boolean,
  message: string,
): Promise<Array<Record<string, unknown>>> {
  await expect
    .poll(async () => ok(await eWidgetRows(page, widgetId)), { message, timeout: 30_000, intervals: [1_000] })
    .toBe(true);
  return eWidgetRows(page, widgetId);
}

/** What a chart grouped by channel draws, as `channel → the bar's value`. A chart is not handed
 *  rows the way a table is (`eWidgetRows` finds nothing on `rb-chart`): its numbers live in its own
 *  instance, which is where `cReadChart` reads the labels from too. */
async function pChartCounts(page: Page, widgetId: string): Promise<Record<string, number>> {
  return cViz(page, widgetId).evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (el as any).getChartInstance?.();
    if (!chart) return {};
    const labels: string[] = (chart.data.labels ?? []).map(String);
    const values: unknown[] = chart.data.datasets?.[0]?.data ?? [];
    return Object.fromEntries(labels.map((label, i) => [label, Number(values[i])]));
  });
}

/**
 * Click the bar a label stands for, where the chart draws it.
 *
 * A chart is one canvas element: there is no element per bar to find by id, so Chart.js is asked
 * which pixel its bar occupies and the mouse is clicked there. It has to be a real click - that is
 * the only kind `rb-chart` listens for, and `intersect: true` means a click beside the bar is not a
 * click on it. The position is polled because a published tile is replaced by a copy of itself
 * whenever the selections change, and the copy draws its chart again from scratch.
 */
async function pClickBar(chart: Locator, label: string): Promise<void> {
  let at: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      if ((await chart.count()) === 0) return false;
      await chart.scrollIntoViewIfNeeded().catch(() => {});
      at = await chart.evaluate((el, wanted) => {
        // On the Canvas the locator is the chart itself (`widgetViz-<id>`); published, it is the
        // chart's own box (`widgetChart-<cid>`), inside the chart's shadow root.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
        if (!instance) return null;
        const index = (instance.data.labels ?? []).findIndex((l: unknown) => String(l) === wanted);
        if (index < 0) return null;
        const bar = instance.getDatasetMeta(0)?.data?.[index];
        if (!bar) return null;
        const point = typeof bar.getCenterPoint === 'function' ? bar.getCenterPoint() : { x: bar.x, y: bar.y };
        const box = instance.canvas.getBoundingClientRect();
        return { x: box.x + point.x, y: box.y + point.y };
      }, label);
      return at !== null;
    }, { message: `the chart draws a bar for ${label}`, timeout: 60_000, intervals: [1_000] })
    .toBe(true);
  await chart.page().mouse.click(at!.x, at!.y);
  await chart.page().waitForTimeout(500);
}

/**
 * What a PUBLISHED tile shows, by its own component id.
 *
 * Not the `data` property the canvas's `eWidgetRows` reads: a published widget fetches its own rows
 * and never writes them back into that property (`RbValue` keeps a `displayValue`, `RbTabulator`
 * hands its rows to Tabulator), so what a reader sees is what there is to read. A published tile is
 * also replaced by a copy of itself when the parameters change (`refreshDataWidgets`), so it is
 * looked up again on every read.
 */
async function pPublishedText(page: Page, componentId: string): Promise<string> {
  const tile = page.locator(`[id="widgetValue-${componentId}"]`);
  if ((await tile.count()) === 0) return '';
  return tile.innerText();
}

/** The number a published KPI has written out, commas and all. */
async function pPublishedNumberIs(page: Page, componentId: string, want: number, message: string): Promise<void> {
  await expect
    .poll(async () => bDigits(await pPublishedText(page, componentId)), { message, timeout: 60_000, intervals: [1_000] })
    .toBe(String(want));
}

/** The cells a published table shows, row by row, in its own column order. An answer of no rows at
 *  all is one of the answers worth asserting, which is why this does not wait for rows. */
async function pPublishedCells(page: Page, componentId: string): Promise<string[][]> {
  return page.locator(`[id^="tabRow-${componentId}-"]`).evaluateAll((rows, cid) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll(`[id^="tabCell-${cid}-"]`)).map((cell) => (cell as HTMLElement).innerText.trim()),
    ),
  componentId);
}

/** Wait until the cells a published table shows satisfy `ok`, then hand them back. */
async function pWaitCells(
  page: Page,
  componentId: string,
  ok: (cells: string[][]) => boolean,
  message: string,
): Promise<string[][]> {
  await expect
    .poll(async () => ok(await pPublishedCells(page, componentId)), { message, timeout: 60_000, intervals: [1_000] })
    .toBe(true);
  return pPublishedCells(page, componentId);
}

/** What a widget says about the slicer fields that do not reach it. */
const pNotFiltered = (page: Page, widgetId: string): Locator =>
  page.locator(`[id="widgetNotFiltered-${widgetId}"]`);

test.describe('Canvas mechanics', () => {
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

    // The data first: every number a test asserts is a row of the demo data seeded for one fixed day.
    await reseedDashDemoData(adminFetch, SERVER_URL);

    await SelfServicePortalsTestHelper.startApp(new FluentTester(electronPage!).gotoApps(), AI_HUB_APP_ID);
    const result = await SelfServicePortalsTestHelper.createExternalBrowser();
    externalBrowser = result.browser;
    await Helpers.signInBrowserContext(result.context);
    await SelfServicePortalsTestHelper.waitForServerReady(result.page, AI_HUB_BASE_URL);
    page = result.page;

    // The sample connection the tests live on is hidden until this preference is on.
    showedSamplesBefore = await readShowSamples(page);
    await setShowSamples(page, true);
  });

  test.afterAll(async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    if (page && !showedSamplesBefore) await setShowSamples(page, false);
    if (externalBrowser) await externalBrowser.close();
    if (electronPage) {
      await SelfServicePortalsTestHelper.stopApp(new FluentTester(electronPage).gotoApps(), AI_HUB_APP_ID);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M01 — Rename a canvas
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M01 Rename a canvas', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const original = 'E2E mech M01 Rename';
    const renamed = 'E2E mech M01 Renamed on purpose';

    await withFreshCanvas(page, original, async (canvasId) => {
      // + the toolbar shows the new name, the server has it, a reload shows it, and so does the canvas list's card.
      await aRenameCanvas(page, renamed);
      await expect(page.locator('#btnCanvasName')).toHaveText(renamed);
      await aWaitStoredName(page, canvasId, renamed);
      await page.reload();
      await expect(page.locator('#btnCanvasName')).toHaveText(renamed, { timeout: 30_000 });
      await page.goto(CANVAS_LIST_URL);
      await expect(page.locator(`#canvasCard-${canvasId}`)).toContainText(renamed, { timeout: 30_000 });

      // − Escape does NOT cancel a rename (CanvasToolbar.tsx: the box writes the store on every key, and only
      //   Enter and blur are handled): the box stays open with what was typed, and Enter keeps it.
      await page.goto(`${AI_HUB_BASE_URL}/explore-data/${canvasId}`);
      await page.locator('#btnCanvasName').click();
      await page.locator('#txtDashboardName').fill('Typed then Escape');
      await page.keyboard.press('Escape');
      await expect(page.locator('#txtDashboardName')).toBeVisible();
      await expect(page.locator('#txtDashboardName')).toHaveValue('Typed then Escape');
      await page.keyboard.press('Enter');
      await expect(page.locator('#btnCanvasName')).toHaveText('Typed then Escape');
      await aWaitStoredName(page, canvasId, 'Typed then Escape');

      // − An empty name is taken as it is: the button is empty (the name cannot be seen or clicked back
      //   by its text). Only the toolbar is asserted; what the server does with '' is recorded as a finding.
      await aRenameCanvas(page, '');
      await expect(page.locator('#btnCanvasName')).toHaveText('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M02 — Delete a widget
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M02 Delete a widget', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M02 Delete a widget', async (canvasId) => {
      await addUIElement(page, 'text', { textContent: 'first widget' });
      const textId = await getLastWidgetId(page);
      await addTableToCanvas(page, 'dash_demo.orders');
      const tableId = await getLastWidgetId(page);
      expect(await aWidgetCount(page)).toBe(2);

      // − Delete and Backspace typed inside the SQL editor edit its text and delete no widget (the typing guard).
      await aSelectWidget(page, tableId);
      await page.locator('#btnQueryTab-finetune').click();
      await page.locator('#selectQueryMode').selectOption('sql');
      await page.locator('#sqlEditorInput').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#sqlEditorInput').click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('SELECT 1 AS one');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Home');
      await page.keyboard.press('Delete');
      await expect(page.locator('#sqlEditorInput')).toContainText('ELECT 1 AS on');
      expect(await aWidgetCount(page)).toBe(2);

      // − The same inside the Text widget's own box.
      await aSelectWidget(page, textId);
      await page.locator('#txtWidgetTextContent').click();
      await page.keyboard.press('End');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Home');
      await page.keyboard.press('Delete');
      await expect(page.locator('#txtWidgetTextContent')).toHaveValue('irst widge');
      expect(await aWidgetCount(page)).toBe(2);

      // + The widget's own x button deletes the selected widget.
      await aSelectWidget(page, tableId);
      await page.locator(`#btnDeleteWidget-${tableId}`).click();
      await expect(page.locator(`#widget-${tableId}`)).toHaveCount(0);
      expect(await aWidgetCount(page)).toBe(1);

      // + Selecting the other and pressing Delete (focus on the page, not in a box) deletes it too.
      await aSelectWidget(page, textId);
      await page.keyboard.press('Delete');
      await expect(page.locator(`#widget-${textId}`)).toHaveCount(0);
      expect(await aWidgetCount(page)).toBe(0);

      // + Both are gone from the stored state, not just from the screen.
      await expect
        .poll(async () => ((await aStored(page, canvasId)).widgets as unknown[]).length,
          { timeout: 20_000, intervals: [500] })
        .toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M03 — Undo and redo with the toolbar
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M03 Undo and redo with the toolbar', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await aWithBareCanvas(page, 'E2E mech M03 Undo and redo', async (canvasId) => {
      // − A brand-new canvas has nothing to undo or redo: both buttons are disabled.
      await expect(page.locator('#btnCanvasUndo')).toBeDisabled();
      await expect(page.locator('#btnCanvasRedo')).toBeDisabled();

      // + Add a widget, make it a bar chart, then a line chart.
      await selectConnectionByCode(page, DASH_DEMO_CONNECTION);
      await addTableToCanvas(page, 'dash_demo.orders');
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await setChartType(page, 'line');
      await expect.poll(() => aStoredChartType(page, canvasId), { timeout: 20_000, intervals: [500] }).toBe('line');

      // + Undo steps back: first the chart type (to bar), then, further back, the widget itself.
      // One user action can be several history steps (the widget's first query writes its columns too), so the
      // test undoes until the wanted state shows and asserts it is reached by going back, never forward.
      const toBar = await aUndoUntil(page, async () => (await aStoredChartType(page, canvasId)) === 'bar');
      expect(toBar, 'the chart type came back by undoing').toBeGreaterThanOrEqual(1);
      expect(await aWidgetCount(page), 'the widget is still there at bar').toBe(1);

      const toEmpty = await aUndoUntil(page, async () =>
        ((await aStored(page, canvasId)).widgets as unknown[]).length === 0);
      expect(toEmpty).toBeGreaterThanOrEqual(1);
      await expect.poll(() => aWidgetCount(page), { timeout: 10_000 }).toBe(0);

      // + Redo steps forward: once brings the widget back, and it is not yet the line chart.
      await expect(page.locator('#btnCanvasRedo')).toBeEnabled();
      await page.locator('#btnCanvasRedo').click();
      await expect.poll(() => aWidgetCount(page), { timeout: 10_000 }).toBe(1);
      await page.waitForTimeout(1_800);
      expect(await aStoredChartType(page, canvasId)).not.toBe('line');

      // + Redo until the end brings the line chart back.
      for (let i = 0; i < 10 && (await aStoredChartType(page, canvasId)) !== 'line'; i++) {
        if (!(await page.locator('#btnCanvasRedo').isEnabled())) break;
        await page.locator('#btnCanvasRedo').click();
        await page.waitForTimeout(1_800);
      }
      expect(await aStoredChartType(page, canvasId)).toBe('line');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M04 — Autosave
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M04 Autosave', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M04 Autosave', async (canvasId) => {
      const putOnly = (pattern: string, handler: (route: Route) => Promise<void>) =>
        page.route(pattern, async (route) => {
          if (route.request().method() !== 'PUT') return route.continue();
          return handler(route);
        });
      const PUT_URL = '**/api/dp/explorations/*';
      const textBox = page.locator('#txtWidgetTextContent');

      await addUIElement(page, 'text', { textContent: 'first' });
      const textId = await getLastWidgetId(page);
      await aSelectWidget(page, textId);
      await expect(page.locator('#saveStatus')).toContainText('Saved', { timeout: 20_000 });

      try {
        // + The indicator walks "Unsaved changes" -> "Saving…" -> "Saved · …" (the save is slowed so "Saving…" can be seen).
        await putOnly(PUT_URL, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          await route.continue();
        });
        await textBox.fill('Autosave one');
        await expect(page.locator('#saveStatus')).toContainText('Unsaved changes');
        await expect(page.locator('#saveStatus')).toContainText('Saving…', { timeout: 10_000 });
        await expect(page.locator('#saveStatus')).toContainText('Saved ·', { timeout: 20_000 });
        await page.unroute(PUT_URL);

        // + A reload shows the change.
        await page.reload();
        await expect(page.locator(`#widget-${textId}`)).toContainText('Autosave one', { timeout: 30_000 });

        // + Ctrl+S saves at once: a PUT leaves within 900 ms of the keys, well before the 1.2 s debounce.
        await aSelectWidget(page, textId);
        await textBox.fill('Autosave two');
        await Promise.all([
          page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/explorations/'), { timeout: 900 }),
          page.keyboard.press('Control+s'),
        ]);
        await expect(page.locator('#saveStatus')).toContainText('Saved', { timeout: 20_000 });
        await expect
          .poll(async () => JSON.stringify((await aStored(page, canvasId)).widgets), { timeout: 20_000, intervals: [500] })
          .toContain('Autosave two');

        // − With the save refused (500) the indicator says "Save failed" and the change stays on screen.
        await putOnly(PUT_URL, async (route) => {
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"refused on purpose"}' });
        });
        await textBox.fill('Autosave three');
        await expect(page.locator('#saveStatus')).toContainText('Save failed', { timeout: 20_000 });
        await expect(page.locator(`#widget-${textId}`)).toContainText('Autosave three');
        await expect(textBox).toHaveValue('Autosave three');
        expect(JSON.stringify((await aStored(page, canvasId)).widgets), 'the refused save wrote nothing')
          .not.toContain('Autosave three');
      } finally {
        // Back to a working save, and the change is then saved (so leaving the page asks nothing).
        await page.unroute(PUT_URL);
        await page.keyboard.press('Control+s');
        await expect(page.locator('#saveStatus')).toContainText('Saved', { timeout: 20_000 });
      }
      await expect
        .poll(async () => JSON.stringify((await aStored(page, canvasId)).widgets), { timeout: 20_000, intervals: [500] })
        .toContain('Autosave three');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M05 — Edit / Preview, and the full-screen preview
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M05 Edit / Preview and the full-screen preview', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const name = 'E2E mech M05 Preview';

    await withFreshCanvas(page, name, async (canvasId) => {
      await addUIElement(page, 'text', { textContent: 'Preview me' });
      const textId = await getLastWidgetId(page);
      await aSelectWidget(page, textId);
      await expect(page.locator('#configPanel')).toBeVisible();
      await expect(page.locator(`#widgetResizeGrip-${textId}`)).toHaveCount(1);
      const gridOf = async () =>
        String(JSON.stringify(((await aStored(page, canvasId)).widgets as Array<Record<string, any>> | undefined)?.[0]?.gridPosition));
      await expect.poll(gridOf, { timeout: 20_000, intervals: [500] }).toContain('"w":6');

      // + Control: in Edit mode a drag of the header does move the widget (the negative below means something).
      const before = await gridOf();
      await aDragHeader(page, textId, 260, 0);
      await expect.poll(gridOf, { timeout: 20_000, intervals: [500] }).not.toBe(before);

      // + Preview: the left panel, the config panel and every resize grip are gone, and a click opens no panel.
      await page.locator('#btnEditPreview').click();
      await expect(page.locator('#btnCollapseLeftPanel')).toHaveCount(0);
      await expect(page.locator('#configPanel')).toHaveCount(0);
      await expect(page.locator('[id^="widgetResizeGrip-"]')).toHaveCount(0);
      await page.locator(`#widgetHeader-${textId}`).click();
      await expect(page.locator('#configPanel')).toHaveCount(0);
      await expect(page.locator('#btnExpandRightPanel')).toHaveCount(0);

      // − In Preview, dragging the header moves nothing: the stored gridPosition is unchanged.
      const moved = await gridOf();
      await aDragHeader(page, textId, -200, 120);
      await page.waitForTimeout(2_500); // longer than the autosave debounce
      expect(await gridOf()).toBe(moved);

      // + Back to Edit: the panels come back.
      await page.locator('#btnEditPreview').click();
      await expect(page.locator('#btnCollapseLeftPanel')).toBeVisible();
      await expect(page.locator(`#widgetResizeGrip-${textId}`)).toHaveCount(1);

      // + Full-screen preview: its own page with the canvas name and the widget; Close Preview returns to the editor.
      await expect.poll(async () => (await aStored(page, canvasId)).name).toBe(name);
      await page.locator('#btnFullScreenPreview').click();
      await page.waitForURL(new RegExp(`/explore-data/${canvasId}/preview$`), { timeout: 30_000 });
      await expect(page.locator('#previewCanvasName')).toHaveText(name, { timeout: 30_000 });
      await expect(page.locator(`#widget-${textId}`)).toContainText('Preview me');
      await expect(page.locator('#configPanel')).toHaveCount(0);
      await page.locator('#btnClosePreview').click();
      await page.waitForURL(new RegExp(`/explore-data/${canvasId}$`), { timeout: 30_000 });
      await expect(page.locator('#btnCanvasName')).toHaveText(name, { timeout: 30_000 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M06 — Share dialog
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M06 Share dialog', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;
    let reader: Page | undefined;
    let readerContext: BrowserContext | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M06 Share dialog', async (canvasId) => {
        // A dashboard with one select filter and one number that answers to it.
        await addFilterBarParam(page, B_CHANNEL_FILTER_DSL);
        await bAddSqlNumber(page, B_CHANNEL_COUNT_SQL, 'orders');
        const published = await publishDashboard(page);
        reportId = published.reportId;
        const numberIds = (await getCanvasComponentIds(page, canvasId)).number;

        // The truth this link must show: the orders of the locked channel, asked as the signed-in author.
        const truth = bOnlyNumber(await bData(page, reportId, numberIds[0], { channel: B_CHANNEL }));
        expect(truth, 'the locked channel has orders').toBeGreaterThan(0);

        // Publish, then Share: lock the channel, expire in 7 days, create, copy.
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: AI_HUB_BASE_URL });
        await page.locator('#btnShareDashboard').click();
        await page.locator('#shareDialog').waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('#shareLockParam-channel').check();
        const lockValue = page.locator('#shareLockValue-channel');
        await lockValue.waitFor({ state: 'visible', timeout: 10_000 });
        // The lock's control is a filter bar of its own, with its form named after it: the page's
        // filter bar is still the one #formReportParameters.
        await expect(page.locator('#shareLockValue-channel_formReportParameters')).toBeVisible();
        await expect(page.locator('#formReportParameters')).toHaveCount(1);
        await lockValue.locator('#channel').selectOption(B_CHANNEL);
        await page.locator('#shareExpiry').selectOption('7');
        await page.locator('#btnCreateShareLink').click();
        await page.locator('#shareNewUrl').waitFor({ state: 'visible', timeout: 15_000 });
        const url = await page.locator('#shareNewUrl').inputValue();
        await page.locator('#btnCopyShareUrl').click();
        expect(
          await page.evaluate(() => navigator.clipboard.readText()),
          'the clipboard holds the link the dialog shows',
        ).toBe(url);

        // The links table lists it with its lock and an expiry (not "Never").
        const row = page.locator('#tableShareLinks [id^="shareLink-"]');
        await expect(row, 'one link is listed').toHaveCount(1);
        await expect(row).toContainText(`channel = ${B_CHANNEL}`);
        await expect(row, 'the 7-day link has an expiry').not.toContainText('Never');

        // A fresh, signed-out browser context opens it: the value is fixed, the control dead, the number the truth.
        readerContext = await page.context().browser()!.newContext();
        reader = await readerContext.newPage();
        await reader.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(reader.locator('#publishedDashboard'), 'the link opens the dashboard with no sign-in')
          .toBeVisible({ timeout: 60_000 });
        await expect(reader.locator('#channel'), 'the locked control cannot be changed').toBeDisabled({ timeout: 30_000 });
        await expect(reader.locator('#channel_lockedNote')).toHaveText('Fixed by this link');
        await expect
          .poll(async () => bDigits(await reader!.locator(`[id="widgetValue-${numberIds[0]}"]`).innerText()), { timeout: 60_000, intervals: [500] })
          .toBe(String(truth));

        // And what the link carries is a credential that works for the data behind the tile.
        const token = new URL(url).searchParams.get('token')!;
        // A share link's token travels as the `token` query parameter, as the page sends it;
        // the X-Embed-Token header is for embed tokens, which are another credential.
        const dataUrl = `${SERVER_URL}/api/reports/${reportId}/data?componentId=${encodeURIComponent(numberIds[0])}&token=${encodeURIComponent(token)}`;
        const allowed = await readerContext.request.get(dataUrl);
        expect(allowed.status(), 'the live link answers its data call').toBe(200);

        // Negative: revoke it, and the same link is refused.
        const linkId = (await row.getAttribute('id'))!.substring('shareLink-'.length);
        await page.locator(`[id="btnRevokeShareLink-${linkId}"]`).click();
        await expect(page.locator('#tableShareLinks [id^="shareLink-"]'), 'the revoked link leaves the table')
          .toHaveCount(0, { timeout: 15_000 });
        const refused = await readerContext.request.get(dataUrl);
        expect([401, 403], `the revoked link is refused (${refused.status()})`).toContain(refused.status());
        await page.locator('#btnShareClose').click();
      });
    } finally {
      if (readerContext) await readerContext.close();
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M19 — Parameters
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M19 Parameters', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M19 Parameters', async (canvasId) => {
        // One required parameter (with a default, so the page opens valid).
        const region = await bAddParam(page, 1, { label: 'Region', required: true, defaultValue: 'DE' });
        expect(region).toBe('region');

        // − with ONE parameter a visual filter offers it first in the bind dropdown, the server's own values after it in a group of their own.
        await addTableToCanvas(page, 'dash_demo.orders');
        await addVisualFilter(page, 0, 'channel', 'equals');
        await expect(page.locator('#selectBindParam-0'), 'the signed-in author is offered the server values too: a dropdown').toBeVisible();
        await expect(page.locator('#btnBindParam-0')).toHaveCount(0);
        const declaredOffers = await page.locator('#selectBindParam-0 > option')
          .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter((v) => v));
        expect(declaredOffers, 'the dashboard parameter, alone outside the server group').toEqual([region]);

        // + with more parameters it is the dropdown. A Date parameter with "widget: auto" is a date input.
        const channel = await bAddParam(page, 2, {
          label: 'Channel',
          widget: 'select',
          options: "SELECT '' AS value, '-- All channels --' AS label UNION ALL SELECT DISTINCT channel AS value, channel AS label FROM dash_demo.orders ORDER BY label",
        });
        const since = await bAddParam(page, 3, { label: 'Since', type: 'Date' });
        await expect(page.locator(`#${since}`), 'a Date with widget auto is a date input').toHaveAttribute('type', 'date');
        await expect(page.locator('#selectBindParam-0'), 'several parameters: the bind dropdown').toBeVisible();
        await expect(page.locator('#btnBindParam-0')).toHaveCount(0);

        // Bind the filter to Channel and count the orders: the number that must narrow to the truth.
        await bindVisualFilterToParam(page, 0, channel);
        await addAggregation(page, 0, 'COUNT', 'order_id');
        await runVisualQuery(page);
        await switchToWidget(page, 'number');
        await setNumberField(page, 'order_id_count');

        // The truth, said another way: the same orders counted by a SQL widget with the channel typed in.
        await bAddSqlNumber(
          page,
          `SELECT count(order_id) AS literal_count FROM dash_demo.orders WHERE channel = '${B_CHANNEL}'`,
          'literal_count',
        );

        // Remove Since: it leaves the bar and the stored state.
        await page.locator('#btnConfigureFilters').click();
        await page.locator(`#btnRemoveParam-${since}`).click();
        await page.locator('#btnDoneFilters').click();
        await page.waitForTimeout(1_500);
        await expect(page.locator(`#${since}`), 'the removed filter is off the bar').toHaveCount(0);
        await expect
          .poll(() => bSavedParamIds(page, canvasId), { timeout: 20_000, intervals: [1_000] })
          .toEqual([region, channel]);

        // Publish and meet the dashboard as a reader.
        const published = await publishDashboard(page);
        reportId = published.reportId;
        const numberIds = (await getCanvasComponentIds(page, canvasId)).number;

        const narrowed = bOnlyNumber(await bData(page, reportId, numberIds[0], { region: 'DE', channel: B_CHANNEL }));
        const literal = bOnlyNumber(await bData(page, reportId, numberIds[1], { region: 'DE' }));
        expect(narrowed, 'bound to the Channel filter, the count narrows to the channel').toBe(literal);
        expect(narrowed).toBeGreaterThan(0);

        const root = await openPublished(page, reportId, { region: 'DE', channel: B_CHANNEL });
        await expect
          .poll(async () => bDigits(await root.locator(`[id="widgetValue-${numberIds[0]}"]`).innerText()), { timeout: 60_000, intervals: [500] })
          .toBe(String(literal));

        // + a Required filter left empty says so; − filled again, it says nothing.
        await expect(page.locator(`#${region}_errors`), 'a valid filter shows no message').toHaveCount(0);
        await page.locator(`#${region}`).fill('');
        await expect(page.locator(`#${region}_errors`)).toContainText('required');
        await page.locator(`#${region}`).fill('DE');
        await expect(page.locator(`#${region}_errors`)).toHaveCount(0);
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M20 — Publish: disabled states and errors
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M20 Publish disabled states and errors', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const publishedName = 'E2E mech M20 Publish states';
    const brokenName = 'E2E mech M20 Publish error';
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, publishedName, async (canvasId) => {
        const publish = page.locator('#btnPublishDashboard');

        // + an empty canvas cannot be published, and says why.
        await expect(publish).toBeDisabled();
        await expect(publish).toHaveAttribute('title', 'Add at least one widget before publishing');

        // + only a Text and a Divider: the dialog opens but warns, and the confirm stays dead.
        await addUIElement(page, 'text', { textContent: '## Only words' });
        await addUIElement(page, 'divider');
        await expect(publish).toBeEnabled();
        await publish.click();
        await expect(page.locator('#publishWarnNoDataWidget')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#btnPublishConfirm')).toBeDisabled();
        await page.locator('#btnPublishCancel').click();
        expect(await bStatusOf(page, `/dashboard/${bSlug(publishedName)}`), 'nothing was published').toBe(404);

        // + with a data widget it publishes, and then there is nothing left to publish.
        await bAddSqlNumber(page, 'SELECT count(*) AS orders FROM dash_demo.orders', 'orders');
        const published = await publishDashboard(page);
        reportId = published.reportId;
        await expect(publish).toBeDisabled({ timeout: 10_000 });
        await expect(publish).toHaveAttribute('title', 'No changes to publish');
        expect(canvasIdOf(page)).toBe(canvasId);
      });

      // − a script widget that does not compile: the publish says so and writes no report.
      await withFreshCanvas(page, brokenName, async (canvasId) => {
        await addTableToCanvas(page, 'dash_demo.orders');
        await runGroovyScript(page, 'def broken = ((');
        await page.locator('#btnPublishDashboard').click();
        await page.locator('#btnPublishConfirm').click();
        await expect(page.locator('#publishError'), 'the compile error is shown').toBeVisible({ timeout: 60_000 });
        expect(((await page.locator('#publishError').innerText()) ?? '').trim().length).toBeGreaterThan(0);
        await expect(page.locator('#publishSuccess')).toHaveCount(0);
        expect(await bStatusOf(page, `/dashboard/${bSlug(brokenName)}`), 'no report was written').toBe(404);
        const saved = await readCanvas(page, canvasId);
        expect(saved.exportedReportCode ?? saved.exported_report_code ?? '', 'the canvas was not marked published').toBeFalsy();
        await page.locator('#btnPublishCancel').click();
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M21 — Canvas list
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M21 Canvas list', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const name = 'E2E mech M21 Canvas list';
    let reportId: string | undefined;
    let canvasId: string | undefined;

    try {
      canvasId = await bNewCanvas(page, name);
      await bAddSqlNumber(page, 'SELECT count(*) AS orders FROM dash_demo.orders', 'orders');
      reportId = (await publishDashboard(page)).reportId;
      expect(await bStatusOf(page, `/dashboard/${reportId}`), 'the dashboard is published').toBe(200);

      const card = page.locator(`#canvasCard-${canvasId}`);
      const dialog = page.locator('#dlgDeleteCanvas');
      const openDelete = async () => {
        await card.hover();
        await page.locator(`#btnDeleteCanvas-${canvasId}`).click({ force: true });
        await dialog.waitFor({ state: 'visible', timeout: 5_000 });
        await expect(dialog).toContainText(name);
      };

      await page.goto(CANVAS_LIST_URL);
      await page.waitForLoadState('networkidle');
      await expect(card).toContainText(name);
      await expect(card).toContainText('1 component');

      // + Cancel, Escape and a click on the backdrop each close the dialog and keep the canvas.
      await openDelete();
      await page.locator('#btnCancelDeleteCanvas').click();
      await expect(dialog).toBeHidden();
      await expect(card).toBeVisible();

      await openDelete();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(card).toBeVisible();

      await openDelete();
      await page.locator('#overlayDeleteCanvas').click({ position: { x: 5, y: 5 } });
      await expect(dialog).toBeHidden();
      await expect(card).toBeVisible();

      // + clicking the card opens that canvas.
      await card.click({ position: { x: 12, y: 12 } });
      await page.waitForURL(new RegExp(`/explore-data/${canvasId}$`), { timeout: 15_000 });
      await expect(page.locator('#btnCanvasName')).toContainText(name);
      await page.goto(CANVAS_LIST_URL);
      await page.waitForLoadState('networkidle');

      // − the confirm deletes the canvas, and its published dashboard goes with it.
      await openDelete();
      await page.locator('#btnConfirmDeleteCanvas').click();
      await expect(card).toHaveCount(0, { timeout: 15_000 });
      expect(await bStatusOf(page, `/api/explorations/${canvasId}`), 'the canvas is gone').toBe(404);
      expect(await bStatusOf(page, `/dashboard/${reportId}`), 'its published dashboard is gone').toBe(404);
    } finally {
      await bDeleteCanvasIfPresent(page, canvasId);
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  test('(canvas mechanics) M07 Chart axes by hand', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M07 Chart axes', async () => {
      // Orders by channel and status, two sums: two dimensions and two metrics to put on the axes.
      // Both sums first: the canvas turns the widget into a chart the moment the first grouped result comes
      // back and keeps the metrics it found then (a user's picks stay), so a sum added after the groups
      // would never reach the axes - and with one metric and two groups the product splits the series by itself.
      await addTableToCanvas(page, 'dash_demo.orders');
      await addAggregation(page, 0, 'SUM', 'total_amount');
      await addAggregation(page, 1, 'SUM', 'shipping_fee');
      await addGroupBy(page, 'channel');
      await addGroupBy(page, 'status');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      const id = await getLastWidgetId(page);
      await setChartType(page, 'bar');

      // + X axis by hand: slot 0 is the channel, and the bars are the four channels.
      await setChartAxes(page, { x: 'channel' });
      await page.locator('#btnDisplayTab').click();
      await expect(page.locator('#selectChartXAxis-0')).toHaveValue('channel');
      await expect(page.locator('#selectChartYAxis-0')).toHaveValue('total_amount_sum');
      await expect(page.locator('#selectChartYAxis-1')).toHaveValue('shipping_fee_sum');
      let chart = await cWaitChart(page, id,
        (s) => cSame([...new Set(s.labels)], C_TRUTHS.CHANNELS) && s.datasets.length === 2,
        'the X values are the channels and each metric is a dataset');
      expect(chart.datasets.map((d) => d.label).sort(), 'the two metrics are the two datasets')
        .toEqual(['shipping_fee_sum', 'total_amount_sum']);
      // − no breakout yet, so no warning.
      await expect(page.locator('#chartSeriesSplitWarning')).toHaveCount(0);

      // + a series breakout (slot 1 of X): the datasets become the statuses, the labels the 4 channels.
      await page.locator('#btnAddChartXAxis').click();
      await expect(page.locator('#selectChartXAxis-1')).toHaveValue('status');
      chart = await cWaitChart(page, id,
        (s) => cSame(s.datasets.map((d) => d.label), Object.keys(C_TRUTHS.ORDERS_BY_STATUS)),
        'the breakout makes one dataset per status');
      expect(cSame(chart.labels, C_TRUTHS.CHANNELS), 'and the labels are the four channels').toBe(true);

      // − a breakout together with two metrics: the panel says only the first metric renders.
      await expect(page.locator('#chartSeriesSplitWarning')).toBeVisible();
      await expect(page.locator('#chartSeriesSplitWarning')).toContainText('only the first metric renders');
      // and while it is active no further metric can be added.
      await expect(page.locator('#btnAddChartYAxis')).toHaveCount(0);

      // + removing the breakout brings the two metrics back and the warning goes.
      await page.locator('#btnRemoveChartXAxis-1').click();
      chart = await cWaitChart(page, id,
        (s) => cSame(s.datasets.map((d) => d.label), ['total_amount_sum', 'shipping_fee_sum']),
        'without the breakout the datasets are the two metrics again');
      expect(cSame([...new Set(chart.labels)], C_TRUTHS.CHANNELS)).toBe(true);
      await expect(page.locator('#chartSeriesSplitWarning')).toHaveCount(0);
      await expect(page.locator('#btnAddChartXAxis')).toBeVisible();
    });
  });

  test('(canvas mechanics) M12 Pivot', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M12 Pivot', async () => {
      // Every order row (SQL has no row cap), so the cells can be held to the truths.
      await addTableToCanvas(page, 'dash_demo.orders');
      await runSqlQuery(page, 'SELECT status, channel, total_amount FROM dash_demo.orders');
      await switchToWidget(page, 'pivot');
      const id = await getLastWidgetId(page);
      const pivot = cViz(page, id);
      await page.locator('#btnDisplayTab').click();
      await page.locator('#configPanel-pivot').waitFor({ state: 'visible', timeout: 10_000 });

      // Switching to a pivot lays the fields out by itself; take every one of them back to the available list first.
      const assigned = page.locator('[id^="btnRemovePivotField-"]');
      for (let left = await assigned.count(); left > 0; left = await assigned.count()) {
        await assigned.first().click();
        await expect(assigned).toHaveCount(left - 1);
      }
      await expect(page.locator('[id="btnDragPivotSource-total_amount"]')).toBeVisible();

      // − a measure cannot be dropped into Rows, a dimension cannot be dropped into Values.
      await cDragPivotField(page, 'total_amount', 'rows');
      await expect(page.locator('[id="btnDragPivotField-total_amount"]'), 'a measure stays out of Rows').toHaveCount(0);
      await cDragPivotField(page, 'status', 'vals');
      await expect(page.locator('[id="btnDragPivotField-status"]'), 'a dimension stays out of Values').toHaveCount(0);
      await expect(page.locator('[id="btnDragPivotSource-status"]')).toBeVisible();

      // + Rows = status, Values = total_amount, counted: the cells are the orders per status.
      await cDragPivotField(page, 'status', 'rows');
      await cDragPivotField(page, 'total_amount', 'vals');
      await page.locator('#selectPivotAggregation').selectOption('Count');
      let p = await cWaitPivot(pivot,
        (x) => x.state.aggregatorName === 'Count' && x.rowKeys.length === Object.keys(C_TRUTHS.ORDERS_BY_STATUS).length,
        'one row per status, counted');
      for (const [status, n] of Object.entries(C_TRUTHS.ORDERS_BY_STATUS)) {
        expect(p.cells[`${status}::`], `${status} orders`).toBe(n);
      }
      expect(cSumCells(p), 'the cells add up to every order').toBe(C_TRUTHS.ORDERS);
      // − one dimension and one measure is a chart's job: the nudge is offered (and is tested last).
      await expect(page.locator(`[id="btnConvertPivotToChart-${id}"]`)).toBeVisible();

      // + Columns = channel: still every order, now in four columns.
      await cDragPivotField(page, 'channel', 'cols');
      p = await cWaitPivot(pivot, (x) => cSame(x.colKeys, C_TRUTHS.CHANNELS), 'a column per channel');
      expect(cSumCells(p), 'the cells still add up to every order').toBe(C_TRUTHS.ORDERS);
      await expect(page.locator(`[id="btnConvertPivotToChart-${id}"]`), 'two dimensions are a pivot, no nudge').toHaveCount(0);

      // + the aggregation: Average x Count = Sum, cell by cell.
      const counts = p.cells;
      await page.locator('#selectPivotAggregation').selectOption('Sum');
      const sums = (await cWaitPivot(pivot, (x) => x.state.aggregatorName === 'Sum', 'summed')).cells;
      await page.locator('#selectPivotAggregation').selectOption('Average');
      const averages = (await cWaitPivot(pivot, (x) => x.state.aggregatorName === 'Average', 'averaged')).cells;
      for (const cell of Object.keys(counts)) {
        if (counts[cell] === 0) continue;
        expect(averages[cell] * counts[cell], `${cell}: average x count`).toBeCloseTo(sums[cell], 0);
      }

      // + the axis sort cycles: A→Z, Z→A, back to the default.
      await page.locator('#btnPivotSortAxis-rows').click();
      p = await cWaitPivot(pivot, (x) => x.state.rowOrder === 'key_a_to_z', 'rows sorted A→Z');
      expect(p.rowKeys).toEqual(Object.keys(C_TRUTHS.ORDERS_BY_STATUS).sort());
      await page.locator('#btnPivotSortAxis-rows').click();
      p = await cWaitPivot(pivot, (x) => x.state.rowOrder === 'key_z_to_a', 'rows sorted Z→A');
      expect(p.rowKeys).toEqual(Object.keys(C_TRUTHS.ORDERS_BY_STATUS).sort().reverse());

      // + a field taken out of a zone goes back to Available fields.
      await page.locator('[id="btnRemovePivotField-channel"]').click();
      await expect(page.locator('[id="btnDragPivotSource-channel"]')).toBeVisible();

      // + Convert to Chart: one dimension + one measure offers it, and it turns the widget into a chart.
      await expect(page.locator(`[id="btnConvertPivotToChart-${id}"]`)).toBeVisible();
      await page.locator(`[id="btnConvertPivotToChart-${id}"]`).click();
      await cWaitChart(page, id, () => true, 'the widget is a chart after Convert to Chart');
      expect(await page.locator(`[id="widgetViz-${id}"]`).evaluate((el) => el.tagName), 'and no pivot is left: it draws a chart')
        .toBe('RB-CHART');

      // + "Auto-pick rows, columns, values": a fresh pivot on a table lays itself out (the button is
      //   pressed by the widget on mount; it is on screen only while that runs).
      await addTableToCanvas(page, 'dash_demo.products');
      await switchToWidget(page, 'pivot');
      const autoId = await getLastWidgetId(page);
      const auto = await cWaitPivot(cViz(page, autoId),
        (x) => (x.state.rows.length + x.state.cols.length) >= 1 && x.state.vals.length >= 1,
        'auto-pick fills rows/columns and values');
      expect(auto.rowKeys.length, 'and the pivot has cells').toBeGreaterThan(0);
    });
  });

  test('(canvas mechanics) M13 Tabulator layout and page size', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M13 Tabulator', async () => {
      await addTableToCanvas(page, 'dash_demo.products');
      await switchToWidget(page, 'tabulator');
      const id = await getLastWidgetId(page);

      // + each of the four layouts reaches the table's options.
      for (const layout of ['fitDataStretch', 'fitColumns', 'fitData', 'fitDataFill']) {
        await setTabulatorOptions(page, { layout });
        await expect
          .poll(async () => (await cReadTabulator(page, id)).options.layout, { message: `layout ${layout}`, timeout: 15_000 })
          .toBe(layout);
      }

      // + 10 rows per page: 200 products are 20 pages, so page 2 and page 3 are there.
      await setTabulatorOptions(page, { pagination: true, pageSize: 10 });
      await expect
        .poll(async () => (await cReadTabulator(page, id)).options.paginationSize, { timeout: 15_000 })
        .toBe(10);
      await expect(page.locator('[id$="btnTabulatorPage-2"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[id$="btnTabulatorPage-3"]')).toBeVisible();

      // + 100 per page: 200 products are exactly two pages (the pager has no page 3).
      await setTabulatorOptions(page, { pageSize: 100 });
      await expect.poll(async () => (await cReadTabulator(page, id)).options.paginationSize, { timeout: 15_000 }).toBe(100);
      await expect(page.locator('[id$="btnTabulatorPage-2"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[id$="btnTabulatorPage-3"]')).toHaveCount(0);

      // − pagination off: no pager at all, and the table holds every product.
      await setTabulatorOptions(page, { pagination: false });
      await expect.poll(async () => (await cReadTabulator(page, id)).options.pagination, { timeout: 15_000 }).toBe(false);
      await expect(page.locator('[id$="btnTabulatorPage-2"]')).toHaveCount(0);
      expect((await cReadTabulator(page, id)).rows, 'every product, no page cut').toBe(C_TRUTHS.PRODUCTS);

      // − "capped by the query limit": a limit of 50 leaves 50 rows, with pagination still off.
      await setVisualLimit(page, 50);
      await runVisualQuery(page);
      await expect.poll(async () => (await cReadTabulator(page, id)).rows, { message: 'the query limit caps the table', timeout: 30_000 }).toBe(50);
    });
  });

  test('(canvas mechanics) M14 Chart helpers', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M14 Chart helpers', async (canvasId) => {
      // + a bar chart over 200 products shows the top 20; "Show all" shows 200; "Show top 20" again.
      await addTableToCanvas(page, 'dash_demo.products');
      await addGroupBy(page, 'sku');
      await addAggregation(page, 0, 'SUM', 'list_price');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      const barId = await getLastWidgetId(page);
      await setChartType(page, 'bar');
      let chart = await cWaitChart(page, barId, (s) => s.labels.length === C_TRUTHS.TOP_N, 'the top 20 bars');
      expect(chart.type).toBe('bar');
      await page.locator(`[id="btnChartShowAll-${barId}"]`).click();
      await cWaitChart(page, barId, (s) => s.labels.length === C_TRUTHS.PRODUCTS, 'Show all draws every product');
      await expect(page.locator(`[id="btnChartShowTopN-${barId}"]`)).toBeVisible();
      await page.locator(`[id="btnChartShowTopN-${barId}"]`).click();
      await cWaitChart(page, barId, (s) => s.labels.length === C_TRUTHS.TOP_N, 'Show top 20 clips again');
      await expect(page.locator(`[id="btnChartShowAll-${barId}"]`)).toBeVisible();

      // + a table with no aggregation offers "Auto-summarize this data", and it adds a COUNT.
      await addTableToCanvas(page, 'dash_demo.orders');
      await switchToWidget(page, 'chart');
      const autoId = await getLastWidgetId(page);
      await expect(page.locator(`[id="btnAutoSummarize-${autoId}"]`)).toBeVisible({ timeout: 15_000 });
      await page.locator(`[id="btnAutoSummarize-${autoId}"]`).click();
      await expect(page.locator(`[id="btnAutoSummarize-${autoId}"]`), 'the prompt goes once summarized').toHaveCount(0, { timeout: 30_000 });
      await expect
        .poll(async () => {
          const w = await cStoredWidget(page, canvasId, autoId);
          return (w?.dataSource?.visualQuery?.summarize ?? []).some((a: { aggregation: string }) => a.aggregation.toUpperCase() === 'COUNT');
        }, { message: 'the stored query now counts', timeout: 30_000, intervals: [1_000] })
        .toBe(true);

      // + "Show as Number instead" turns the widget into a Number.
      await addTableToCanvas(page, 'dash_demo.customers');
      await switchToWidget(page, 'chart');
      const numId = await getLastWidgetId(page);
      await page.locator(`[id="btnShowAsNumber-${numId}"]`).click();
      await expect
        .poll(async () => (await cStoredWidget(page, canvasId, numId))?.type, { message: 'the widget is a number', timeout: 30_000, intervals: [1_000] })
        .toBe('number');

      // − a pie over more than 5 slices is not drawn as a pie unless the type was picked; picked, it stays.
      await addTableToCanvas(page, 'dash_demo.products');
      await runSqlQuery(page, 'SELECT category, SUM(list_price) AS list_price_sum FROM dash_demo.products GROUP BY category');
      await switchToWidget(page, 'chart');
      const pieId = await getLastWidgetId(page);
      chart = await cWaitChart(page, pieId, (s) => s.labels.length === C_TRUTHS.PRODUCT_CATEGORIES, 'one slice per category');
      expect(['pie', 'doughnut'], 'more than 5 slices are not a pie by default').not.toContain(chart.type);
      await setChartType(page, 'pie');
      chart = await cWaitChart(page, pieId, (s) => s.type === 'pie', 'an explicit pie stays a pie');
      expect(chart.labels.length).toBe(C_TRUTHS.PRODUCT_CATEGORIES);
    });
  });

  test('(canvas mechanics) M25 DSL editing', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;
    try {
      await withFreshCanvas(page, 'E2E mech M25 DSL editing', async () => {
        // ── A Tabulator written in DSL, with initialSort.
        await addTableToCanvas(page, 'dash_demo.products');
        await switchToWidget(page, 'tabulator');
        const tabId = await getLastWidgetId(page);

        // + "Show Example" opens the tabulator DSL example.
        await page.locator('#btnDisplayTab').click();
        await openDslEditor(page);
        await page.locator('#btnShowDslExample').click();
        await expect(page.locator('#dslExampleInput')).toContainText('tabulator', { timeout: 15_000 });
        await page.locator('#btnCloseDslExample').click();
        await page.locator('#btnDataTab').click();

        const tabulatorDsl = [
          'tabulator {',
          "  layout 'fitColumns'",
          '  autoColumns true',
          '  pagination true',
          '  paginationSize 10',
          "  initialSort([[column: 'list_price', dir: 'desc']])",
          '}',
          '',
        ].join('\n');
        await setWidgetDsl(page, tabulatorDsl);

        // + the Canvas sorts: options carry initialSort and the first row is the dearest product.
        await expect
          .poll(async () => (await cReadTabulator(page, tabId)).options.initialSort, { message: 'initialSort reaches the table', timeout: 20_000 })
          .toEqual([{ column: 'list_price', dir: 'desc' }]);
        const dearest = await cViz(page, tabId).evaluate((el) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Math.max(...((el as any).data as Array<{ list_price: unknown }>).map((r) => Number(r.list_price))));
        await expect
          .poll(async () => cFirstRowCell(page, tabId, 'list_price'), { message: 'the Canvas draws the dearest product first', timeout: 20_000 })
          .toBeCloseTo(dearest, 2);

        // ── A pivot written in DSL, with rendererName.
        await addTableToCanvas(page, 'dash_demo.orders');
        await runSqlQuery(page, 'SELECT status, channel, total_amount FROM dash_demo.orders');
        await switchToWidget(page, 'pivot');
        const pivotId = await getLastWidgetId(page);
        const pivotDsl = [
          'pivotTable {',
          "  rows(['status'])",
          "  cols(['channel'])",
          "  vals(['total_amount'])",
          "  aggregatorName 'Sum'",
          "  rendererName 'Table Row Heatmap'",
          '}',
          '',
        ].join('\n');
        await setWidgetDsl(page, pivotDsl);
        const canvasPivot = await cWaitPivot(cViz(page, pivotId),
          (x) => x.state.rendererName === 'Table Row Heatmap' && cSame(x.colKeys, C_TRUTHS.CHANNELS),
          'the Canvas renders the DSL pivot with its renderer');
        expect(canvasPivot.state.rows).toEqual(['status']);

        // + the same two on the published page.
        const canvasId = canvasIdOf(page);
        const published = await publishDashboard(page);
        reportId = published.reportId;
        const pubIds = await getCanvasComponentIds(page, canvasId);
        const pubTable = pubIds.tabulator[0];
        await openPublished(page, published.reportId);
        await expect(page.locator(`[id="widgetTabulator-${pubTable}"]`)).toBeVisible({ timeout: 60_000 });
        await expect
          .poll(async () => cFirstRowCell(page, pubTable, 'list_price'), { message: 'the published table sorts the same way', timeout: 60_000 })
          .toBeCloseTo(dearest, 2);
        await cWaitPivot(page.locator(`[id="widgetPivot-${pubIds.pivot[0]}"]`),
          (x) => x.state.rendererName === 'Table Row Heatmap',
          'the published pivot has the DSL renderer');

        // ── The Filters dialog has its own example.
        await page.goBack();
        await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator('#btnConfigureFilters').click();
        await page.locator('#btnFilterDslToggle').click();
        await page.locator('#btnShowFilterDslExample').click();
        await expect(page.locator('#dslExampleInput')).toContainText('parameter', { timeout: 15_000 });
        await page.locator('#btnCloseDslExample').click();
        await page.locator('#btnCloseFilterConfig').click();

        // − an invalid DSL shows "DSL error" and the table keeps rendering its last good config.
        await cSelectWidget(page, tabId);
        await cTypeDslAndStay(page, 'tabulator {\n  layout \n  initialSort([[\n');
        await expect(page.locator('#dslSyncError'), 'the editor says the DSL is wrong').toBeVisible({ timeout: 20_000 });
        const kept = await cReadTabulator(page, tabId);
        expect(kept.options.initialSort, 'the table keeps its last good config').toEqual([{ column: 'list_price', dir: 'desc' }]);
        expect(await cFirstRowCell(page, tabId, 'list_price')).toBeCloseTo(dearest, 2);
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

test('(canvas mechanics) M08 Error states', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M08 Error states', async () => {
    await addTableToCanvas(page, 'dash_demo.orders');
    const id = await getLastWidgetId(page);

    // + a SQL error: the widget and the query line both carry the database's message.
    await runSqlQuery(page, 'SELECT nope FROM dash_demo.orders');
    await expect(page.locator(`#widgetError-${id}`), 'the widget shows the query error').toContainText(/nope/i, { timeout: 30_000 });
    await expect(page.locator('#queryErrorLine'), 'the query line shows the database message').toContainText(/nope/i);
    await expect(dRowCount(page), 'a failed query reports no rows').toHaveCount(0);

    // + fixing the SQL clears both and shows the data.
    await runSqlQuery(page, 'SELECT order_id, channel FROM dash_demo.orders LIMIT 5');
    await expect(dRowCount(page)).toContainText('5 rows returned', { timeout: 30_000 });
    await expect(page.locator('#queryErrorLine'), 'the fixed query leaves no error line').toHaveCount(0);

    // − a valid query shows neither error, whatever the widget became after its first result.
    await expect(page.locator(`#widgetError-${id}`), 'the fixed query leaves no widget error').toHaveCount(0);
  });
});

test('(canvas mechanics) M09 Finetune → Visual', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M09 Finetune and Visual', async () => {
    // A visual query: orders per channel.
    await addTableToCanvas(page, 'dash_demo.orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await expect(dRowCount(page), 'the visual query has a row per channel').toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });

    // Finetune → SQL with an edited statement.
    await runSqlQuery(page, 'SELECT order_id FROM dash_demo.orders LIMIT 3');
    await expect(dRowCount(page), 'the edited SQL answers').toContainText('3 rows returned', { timeout: 30_000 });

    // + back on Visual - which asks first, because the SQL was written by hand (D3) - the widget
    //   shows the visual query's result again.
    await page.locator('#btnQueryTab-visual').click();
    await page.locator('#btnSwitchToVisual').click();
    await expect(dRowCount(page), 'the visual query answers again').toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });

    // − while on Visual, the edited SQL does not run, and has no Run button on screen.
    await expect(dRowCount(page)).not.toContainText('3 rows returned');
    await expect(page.locator('#btnRunSqlQuery')).toHaveCount(0);

    // + returning to Finetune shows the query the Visual tab writes: the hand-written one went with
    //   the Switch, which is what the question was about. M60 is the test of the question itself.
    await page.locator('#btnQueryTab-finetune').click();
    await expect(page.locator('#sqlEditorInput')).toContainText('channel', { timeout: 15_000 });
  });
});

test('(canvas mechanics) M10 Detail column settings', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M10 Detail column settings', async (canvasId) => {
    // A one-row Detail whose numbers are in the query itself, so the expected text needs no seed.
    await addTableToCanvas(page, 'dash_demo.orders');
    await runSqlQuery(page, "SELECT 'Acme' AS company, 12345.678 AS score");
    await switchToWidget(page, 'detail');
    const detailId = await getLastWidgetId(page);
    const detail = page.locator(`[id="widgetViz-${detailId}"]`);
    await expect(detail).toContainText('Acme', { timeout: 30_000 });

    // + gear on one field: a new title, "Display as: Currency", 0 decimals.
    await dSetDetailColumn(page, detailId, 'score', { title: 'Final score', viewAs: 'currency', decimals: 0 });
    await expect(detail, 'the new title shows').toContainText('Final score');
    await expect(detail, 'the value is currency with no decimals').toContainText(/\$\s?12,346(?![.\d])/);

    // + and it is still there after a reload (it was stored, not just drawn).
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.columnSettings?.score?.columnTitle, { timeout: 20_000 })
      .toBe('Final score');
    await page.reload();
    await expect(detail).toContainText('Final score', { timeout: 60_000 });
    await expect(detail).toContainText(/\$\s?12,346(?![.\d])/);

    // − Reset to defaults brings back the default display.
    await page.locator(`[id="${detailId}_btnColumnSettings-score"]`).click();
    await page.locator('#btnResetColumnSettings').click();
    await page.locator('#btnDoneColumnSettings').click();
    await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
    await expect(detail).not.toContainText('Final score');
    await expect(detail).not.toContainText('$');
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.columnSettings?.score, { timeout: 20_000 })
      .toBeUndefined();
  });
});

test('(canvas mechanics) M15 Visualize as', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M15 Visualize as', async (canvasId) => {
    await addTableToCanvas(page, 'dash_demo.orders');
    expect((await dStoredWidgets(page, canvasId)).length, 'one widget on the canvas').toBe(1);

    // − without a manual pick, the first result moves a drop-default tabulator to the type that fits.
    await runSqlQuery(page, 'SELECT channel, COUNT(*) AS orders FROM dash_demo.orders GROUP BY channel');
    await expect(dRowCount(page)).toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.type, { timeout: 20_000 })
      .not.toBe('tabulator');

    // + #btnMoreWidgets opens #moreWidgetsGrid (and closes it again).
    await expect(page.locator('#btnMoreWidgets')).toBeVisible();
    const openBefore = await page.locator('#moreWidgetsGrid').isVisible();
    await page.locator('#btnMoreWidgets').click();
    await expect(page.locator('#moreWidgetsGrid'))[openBefore ? 'toBeHidden' : 'toBeVisible']();
    await page.locator('#btnMoreWidgets').click();
    await expect(page.locator('#moreWidgetsGrid'))[openBefore ? 'toBeVisible' : 'toBeHidden']();

    // + #sparklesBadge sits on exactly one button of the Visualize as buttons.
    await expect(page.locator('#sparklesBadge')).toHaveCount(1);
    const bestFit = (await dStoredWidgets(page, canvasId))[0]?.type;
    await expect(page.locator(`[id="btnVisualizeAs-${bestFit}"] #sparklesBadge`), 'on the best fit, the type the widget moved to')
      .toHaveCount(1);

    // + after a manual pick the type is pinned: running the query again does not switch it.
    await switchToWidget(page, 'tabulator');
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.userPicked, { timeout: 20_000 })
      .toBe(true);
    await runSqlQuery(page, 'SELECT channel, COUNT(*) AS orders FROM dash_demo.orders GROUP BY channel');
    await expect(dRowCount(page)).toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });
    await page.waitForTimeout(3_000);
    expect((await dStoredWidgets(page, canvasId))[0]?.type, 'the picked type survives a re-run').toBe('tabulator');
  });
});

test('(canvas mechanics) M16 Detect columns; add a cube from the schema browser', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M16 Columns and cubes', async (canvasId) => {
    // + after a SQL run the Display tab lists the query's columns without any click on Detect.
    await addTableToCanvas(page, 'dash_demo.orders');
    await runSqlQuery(page, 'SELECT order_id, channel, total_amount FROM dash_demo.orders LIMIT 5');
    await switchToWidget(page, 'tabulator');
    await clickDisplayTab(page);
    for (const column of ['order_id', 'channel', 'total_amount']) {
      await expect(page.locator(`#btnToggleCol-${column}`), `the Display tab lists ${column}`).toBeVisible({ timeout: 15_000 });
    }
    // − and the "Detect columns" hint, which is for a widget with no columns yet, is not offered.
    await expect(page.locator('#btnDetectColumns')).toHaveCount(0);
    await clickDataTab(page);

    // − "No" on the add prompt adds nothing.
    const before = await dWidgetCount(page);
    await page.locator('[id="btnCube-dd-sales"]').click();
    await page.locator('[id="btnCancelAddCube-dd-sales"]').click();
    await expect(page.locator('[id="btnConfirmAddCube-dd-sales"]')).toHaveCount(0);
    expect(await dWidgetCount(page), 'declining adds no widget').toBe(before);

    // + "Yes" adds a pivot on the cube, and picking its fields gives it data.
    await addCubeToCanvas(page, 'dd-sales');
    expect(await dWidgetCount(page), 'the cube adds one widget').toBe(before + 1);
    await clickDataTab(page);
    await applyCubeSelection(page, { dimensions: ['Channel'], measures: ['Revenue'] });
    await expect(dRowCount(page), 'the cube answers a row per channel').toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[1]?.dataSource?.visualQuery?.cubeId, { timeout: 20_000 })
      .toBe('dd-sales');
  });
});

test('(canvas mechanics) M17 Schema browser', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M17 Schema browser', async () => {
    const everyTable = await dListedTableIds(page);
    expect(everyTable, 'the sample connection lists its tables').toContain('btnTable-dash_demo.orders');
    const nameOf = (id: string) => id.replace('btnTable-', '').split('.').pop()!.toLowerCase();

    // + the search shows only the matching tables (and cubes).
    await page.locator('#txtSchemaSearch').fill('invoice');
    const wanted = everyTable.filter((id) => nameOf(id).includes('invoice'));
    expect(wanted, 'invoices is a table of the demo data').toContain('btnTable-dash_demo.invoices');
    await expect.poll(() => dListedTableIds(page), { timeout: 15_000 }).toEqual(wanted);
    const cubeNames = await page.locator('[id^="btnCube-"]').evaluateAll((els) => els.map((el) => (el.textContent ?? '').toLowerCase()));
    for (const name of cubeNames) expect(name, 'a cube left in the list matches the search').toContain('invoice');

    // + "Clear search" restores the list.
    await page.locator('#btnClearSchemaSearch').click();
    await expect.poll(() => dListedTableIds(page), { timeout: 15_000 }).toEqual(everyTable);

    // − a search matching nothing says so.
    await page.locator('#txtSchemaSearch').fill('zzz_no_such_table');
    await expect(page.locator('#schemaNoMatch')).toBeVisible();
    await expect(page.locator('#schemaBrowserTablesList')).toHaveCount(0);
    await page.locator('#btnClearSchemaSearch').click();
    await expect(page.locator('#schemaNoMatch')).toHaveCount(0);

    // + collapsing "Tables" hides them, and opening it brings them back.
    await page.locator('#btnToggleTablesGroup').click();
    await expect(page.locator('#schemaBrowserTablesList')).toHaveCount(0);
    await page.locator('#btnToggleTablesGroup').click();
    await expect(page.locator('#schemaBrowserTablesList')).toBeVisible();

    // + "Show columns" on orders lists its columns with their types (the server's own schema is the truth).
    const schema = await dSchemaOf('rbt-sample-northwind-duckdb-4f2');
    const orders = schema.tables.find((t) => t.tableName === 'orders' && t.schemaName === 'dash_demo');
    expect(orders, 'the server knows dash_demo.orders').toBeTruthy();
    await page.locator('[id="btnToggleTableColumns-dash_demo.orders"]').click();
    for (const column of orders!.columns) {
      await expect(
        page.locator(`[id="schemaColumn-dash_demo.orders-${column.columnName}"]`),
        `orders lists ${column.columnName} with its type`,
      ).toHaveAttribute('title', `${column.columnName} (${column.typeName})`);
    }

    // − Cancel on the add prompt adds no widget.
    await page.locator('[id="btnTable-dash_demo.orders"]').click();
    await page.locator('[id="btnCancelAdd-dash_demo.orders"]').click();
    await expect(page.locator('[id="btnConfirmAdd-dash_demo.orders"]')).toHaveCount(0);
    expect(await dWidgetCount(page), 'cancelling adds no widget').toBe(0);
  });
});

test('(canvas mechanics) M18 Panels and left tabs', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M18 Panels and tabs', async () => {
    // + the left tabs switch between the data source and the UI elements.
    await page.locator('#btnLeftTabElements').click();
    await expect(page.locator('#btnAddElement-text')).toBeVisible();
    await expect(page.locator('#selectConnection')).toHaveCount(0);
    await page.locator('#btnLeftTabData').click();
    await expect(page.locator('#selectConnection')).toBeVisible();
    await expect(page.locator('#btnAddElement-text')).toHaveCount(0);

    // + the left panel collapses and expands.
    await page.locator('#btnCollapseLeftPanel').click();
    await expect(page.locator('#selectConnection')).toHaveCount(0);
    await expect(page.locator('#btnExpandLeftPanel')).toBeVisible();
    await page.locator('#btnExpandLeftPanel').click();
    await expect(page.locator('#selectConnection')).toBeVisible();

    // + the right panel opens with a selected widget, collapses and expands.
    await expect(page.locator('#configPanel')).toHaveCount(0);
    await addUIElement(page, 'text');
    await expect(page.locator('#configPanel')).toBeVisible();
    await page.locator('#btnCollapseRightPanel').click();
    await expect(page.locator('#configPanel')).toHaveCount(0);
    await expect(page.locator('#btnExpandRightPanel')).toBeVisible();
    await page.locator('#btnExpandRightPanel').click();
    await expect(page.locator('#configPanel')).toBeVisible();

    // − selecting another widget opens the right panel even after it was collapsed by hand.
    await page.locator('#btnCollapseRightPanel').click();
    await expect(page.locator('#configPanel')).toHaveCount(0);
    await addUIElement(page, 'divider');
    await expect(page.locator('#configPanel')).toBeVisible({ timeout: 15_000 });

    // − and deselecting closes it.
    await page.keyboard.press('Escape');
    await expect(page.locator('#configPanel')).toHaveCount(0);
    await expect(page.locator('#btnExpandRightPanel')).toBeVisible();
  });
});

test('(canvas mechanics) M11 Map settings', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M11 Map settings', async (canvasId) => {
    const orders = frozenRows('orders');
    const cities = frozenRows('geo_cities');

    // + region: orders by country_code, coloured as world countries.
    const regionId = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'country_code');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'map');
    await setMapConfig(page, {
      type: 'region', region: 'world_countries', dimension: 'country_code', metric: 'order_id_count',
    });
    const countries = new Set(orders.map((r) => r.country_code)).size;
    await expect
      .poll(() => eMapShapes(page, regionId), { timeout: 60_000, intervals: [1_000] })
      .toBeGreaterThanOrEqual(countries);

    // + pin: one pin per city of geo_cities.
    const pinId = await eNewVisualWidget(page, 'geo_cities');
    await runVisualQuery(page);
    await switchToWidget(page, 'map');
    await setMapConfig(page, { type: 'pin', latField: 'latitude', lonField: 'longitude' });
    await expect
      .poll(() => eMapShapes(page, pinId), { timeout: 60_000, intervals: [1_000] })
      .toBe(cities.length);

    // + grid: cities counted per latitude/longitude cell are drawn as cells, not as an error.
    await addTableToCanvas(page, 'dash_demo.geo_cities');
    const gridId = await getLastWidgetId(page);
    await runSqlQuery(page,
      'SELECT latitude, longitude, COUNT(*) AS cities FROM dash_demo.geo_cities GROUP BY latitude, longitude');
    await switchToWidget(page, 'map');
    await setMapConfig(page, { type: 'grid', latField: 'latitude', lonField: 'longitude', metric: 'cities' });
    await expect
      .poll(() => eMapShapes(page, gridId), { timeout: 60_000, intervals: [1_000] })
      .toBeGreaterThan(0);
    expect(await eWidgetText(page, gridId), 'a grid with its fields shows no error').not.toContain('Grid map needs');

    // The three types and their fields are what the server saved.
    const stored = await eStoredWidgets(page, canvasId, (w) => {
      const types = w.filter((x) => x.type === 'map').map((x) => x.displayConfig?.mapType);
      return types.join() === 'region,pin,grid' && w.find((x) => x.displayConfig?.mapType === 'grid')?.displayConfig?.metric === 'cities';
    });
    const maps = stored.filter((w) => w.type === 'map').map((w) => w.displayConfig);
    expect(maps.map((m) => m.mapType)).toEqual(['region', 'pin', 'grid']);
    expect(maps[0]).toMatchObject({ region: 'world_countries', dimension: 'country_code', metric: 'order_id_count' });
    expect(maps[1]).toMatchObject({ latField: 'latitude', lonField: 'longitude' });
    expect(maps[2]).toMatchObject({ latField: 'latitude', lonField: 'longitude', metric: 'cities' });

    // − pin over data that has no latitude or longitude: the map says what it needs, it is not broken.
    const noLatLonId = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'country_code');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'map');
    await setMapConfig(page, { type: 'pin' });
    await expect
      .poll(() => eWidgetText(page, noLatLonId), { timeout: 30_000 })
      .toContain('Pin map needs latitude/longitude columns.');
    expect(await eMapShapes(page, noLatLonId), 'no pin is drawn').toBe(0);
  });
});

test('(canvas mechanics) M22 Gauge, Trend and Progress settings', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M22 Gauge Trend Progress', async (canvasId) => {
      const orders = frozenRows('orders');
      const completed = orders.filter((r) => r.status === 'completed').length;

      // Gauge: the share of completed orders, 0..1, in percent, with its own three limits.
      await addTableToCanvas(page, 'dash_demo.orders');
      const gaugeId = await getLastWidgetId(page);
      await runSqlQuery(page,
        "SELECT AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) AS completed_rate FROM dash_demo.orders");
      await switchToWidget(page, 'gauge');
      await setGaugeField(page, 'completed_rate');
      await setGaugeConfig(page, { label: 'Completed orders', min: 0, max: 1, format: 'percent', bands: [0.5, 0.8, 1] });

      // Trend: orders per month, labelled and formatted.
      await addTableToCanvas(page, 'dash_demo.orders');
      const trendId = await getLastWidgetId(page);
      await runSqlQuery(page,
        "SELECT strftime(order_ts, '%Y-%m') AS order_month, COUNT(*) AS orders FROM dash_demo.orders GROUP BY 1 ORDER BY 1");
      await switchToWidget(page, 'trend');
      await setTrendConfig(page, { date: 'order_month', value: 'orders', format: 'number', label: 'Orders per month' });

      // Progress: completed orders against all orders as the goal.
      await addTableToCanvas(page, 'dash_demo.orders');
      const progressId = await getLastWidgetId(page);
      await runSqlQuery(page, "SELECT COUNT(*) AS completed_orders FROM dash_demo.orders WHERE status = 'completed'");
      await switchToWidget(page, 'progress');
      await setProgressConfig(page, {
        field: 'completed_orders', goal: orders.length, format: 'number', label: 'Completed against all orders',
      });

      // + on the Canvas: what each widget was handed.
      const options = await page.evaluate((ids) => {
        const read = (id: string) =>
          JSON.parse(JSON.stringify(
            ((document.getElementById(`widgetViz-${id}`) as unknown as { options?: unknown })?.options) ?? {}));
        return { gauge: read(ids.g), trend: read(ids.t), progress: read(ids.p) };
      }, { g: gaugeId, t: trendId, p: progressId });
      expect(options.gauge).toMatchObject({ min: 0, max: 1, label: 'Completed orders', format: 'percent' });
      expect((options.gauge.bands as Array<{ to: number }>).map((b) => b.to)).toEqual([0.5, 0.8, 1]);
      expect(options.trend).toMatchObject({ label: 'Orders per month', format: 'number' });
      expect(options.progress).toMatchObject({ goal: orders.length, label: 'Completed against all orders', format: 'number' });
      const trendRows = await eWidgetRows(page, trendId);
      expect(trendRows.reduce((sum, r) => sum + Number(r.orders), 0), 'the trend counts every order').toBe(orders.length);

      // + on the published page: each setting is on the tile a reader sees.
      const published = await publishDashboard(page);
      reportId = published.reportId;
      const ids = await getCanvasComponentIds(page, canvasId);
      const dashboard = await openPublished(page, published.reportId);
      const gauge = dashboard.locator(`[id="widgetGauge-${ids.gauge[0]}"]`);
      await expect(gauge).toContainText('Completed orders', { timeout: 60_000 });
      await expect(gauge).toContainText(/91\.9%|92%/);
      const trend = dashboard.locator(`[id="widgetTrend-${ids.trend[0]}"]`);
      await expect(trend).toContainText('Orders per month', { timeout: 60_000 });
      await expect(trend).toContainText(eNumberPattern(Number(trendRows[trendRows.length - 1].orders)));
      const progress = dashboard.locator(`[id="widgetProgress-${ids.progress[0]}"]`);
      await expect(progress).toContainText('Completed against all orders', { timeout: 60_000 });
      await expect(progress).toContainText(new RegExp(`${eNumberPattern(completed).source} / ${eNumberPattern(orders.length).source}`));
      await expect(progress).toContainText(`${((completed / orders.length) * 100).toFixed(1)}%`);

      // − Reset brings the gauge bands back to the defaults.
      await page.goto(`${AI_HUB_BASE_URL}/explore-data/${canvasId}`);
      await page.locator(`[id="widgetHeader-${gaugeId}"]`).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator(`[id="widgetHeader-${gaugeId}"]`).click();
      await page.locator('#btnDisplayTab').click();
      await expect(page.locator('#inputGaugeBand-0')).toHaveValue('0.5', { timeout: 15_000 });
      await page.locator('#btnResetGaugeBands').click();
      for (const [i, to] of ['33', '66', '100'].entries()) {
        await expect(page.locator(`#inputGaugeBand-${i}`), `band ${i + 1} is back to its default`).toHaveValue(to);
      }
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M23 Visual filter operators', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M23 Visual filter operators', async () => {
    const orders = frozenRows('orders');
    const customers = frozenRows('customers');
    const products = frozenRows('products');
    const amount = (r: Record<string, string>) => Number(r.total_amount);

    // + number: between, inclusive at both ends.
    expect(await eCountWhere(page, 'orders', 'order_id',
      [{ column: 'total_amount', operator: 'between', value: '100', valueTo: '200' }]))
      .toBe(orders.filter((r) => amount(r) >= 100 && amount(r) <= 200).length);

    // + string: in and not in, comma separated.
    expect(await eCountWhere(page, 'orders', 'order_id',
      [{ column: 'channel', operator: 'in', value: 'web, mobile_app' }]))
      .toBe(orders.filter((r) => ['web', 'mobile_app'].includes(r.channel)).length);
    expect(await eCountWhere(page, 'orders', 'order_id',
      [{ column: 'channel', operator: 'not_in', value: 'web, mobile_app' }]))
      .toBe(orders.filter((r) => !['web', 'mobile_app'].includes(r.channel)).length);

    // + null tests on a date column that is empty for orders never delivered.
    expect(await eCountWhere(page, 'orders', 'order_id', [{ column: 'delivered_ts', operator: 'is_null' }]))
      .toBe(orders.filter((r) => r.delivered_ts === '').length);
    expect(await eCountWhere(page, 'orders', 'order_id', [{ column: 'delivered_ts', operator: 'is_not_null' }]))
      .toBe(orders.filter((r) => r.delivered_ts !== '').length);

    // + text: starts with.
    expect(await eCountWhere(page, 'customers', 'customer_id',
      [{ column: 'name', operator: 'starts_with', value: 'Anna' }]))
      .toBe(customers.filter((r) => r.name.startsWith('Anna')).length);

    // + date: on or after, and before, one day cut the table in two with nothing lost or counted twice
    // (the seed moves the dates, so the cut is not read off the frozen rows; the total is the truth).
    const onOrAfter = await eCountWhere(page, 'orders', 'order_id',
      [{ column: 'order_ts', operator: 'greater_or_equal', value: '2025-01-01' }]);
    const before = await eCountWhere(page, 'orders', 'order_id',
      [{ column: 'order_ts', operator: 'less_than', value: '2025-01-01' }]);
    expect(onOrAfter, 'some orders are on or after the day').toBeGreaterThan(0);
    expect(before, 'some orders are before the day').toBeGreaterThan(0);
    expect(onOrAfter + before, 'the two halves are every order').toBe(orders.length);

    // + boolean: =
    expect(await eCountWhere(page, 'products', 'product_id',
      [{ column: 'discontinued', operator: 'equals', value: 'true' }]))
      .toBe(products.filter((r) => r.discontinued === 'true').length);

    // − a bound-parameter chip's x unbinds it, and the box is a typed value again.
    await addFilterBarParam(page, `reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel', defaultValue: 'web') {
    constraints(required: false)
    ui(control: 'text')
  }
}
`);
    const id = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'channel', 'equals');
    await bindVisualFilterToParam(page, 0, 'channel');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await expect(page.locator('#btnUnbindFilterValue-0'), 'the filter is bound to ${channel}').toBeVisible();
    await expect
      .poll(async () => eScalar(await eWidgetRows(page, id)), { timeout: 20_000 })
      .toBe(orders.filter((r) => r.channel === 'web').length);
    await page.locator('#btnUnbindFilterValue-0').click();
    await expect(page.locator('#btnUnbindFilterValue-0'), 'the chip is gone').toHaveCount(0);
    await expect(page.locator('#inputFilterValue-0'), 'a typed value is asked for again').toHaveValue('');
    await page.locator('#inputFilterValue-0').fill('marketplace');
    await runVisualQuery(page);
    await expect
      .poll(async () => eScalar(await eWidgetRows(page, id)), { timeout: 20_000 })
      .toBe(orders.filter((r) => r.channel === 'marketplace').length);
  });
});

test('(canvas mechanics) M24 AI help prompt builders', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M24 AI help', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: AI_HUB_BASE_URL });

    // SQL: the prompt carries the table and its columns; a second table joins it; Copy fills the clipboard.
    await addTableToCanvas(page, 'dash_demo.orders');
    await eOpenFinetune(page, 'sql');
    await runSqlQuery(page, 'SELECT order_id, total_amount FROM dash_demo.orders LIMIT 5');
    const sqlBefore = await page.locator('#sqlEditorInput').innerText();
    await page.locator('#btnAiHelpSql').click();
    const sqlPrompt = await eBuildAiPrompt(page, 'Revenue by channel for completed orders');
    expect(sqlPrompt).toMatch(/"tableName":\s*"(dash_demo\.)?orders"/);
    expect(sqlPrompt).toContain('"name": "total_amount"');
    expect(sqlPrompt).toContain('DuckDB');
    await page.locator('#btnAiHelpPickTables').click();
    await page.locator('[id="chkPickTable-dash_demo.customers"]').check();
    await page.locator('#btnPickTables').click();
    await expect
      .poll(() => page.locator('#txtAiHelpPrompt').inputValue(), { timeout: 30_000 })
      .toMatch(/"tableName":\s*"(dash_demo\.)?customers"/);
    await page.locator('#btnCopyToClipboard').click();
    expect(await eClipboardText(page)).toBe(await page.locator('#txtAiHelpPrompt').inputValue());

    // − Close leaves the widget's SQL as it was.
    await page.locator('#btnCloseAiHelp').click();
    await expect(page.locator('#txtAiRequirement')).toHaveCount(0);
    expect(await page.locator('#sqlEditorInput').innerText()).toBe(sqlBefore);

    // Script.
    await eOpenFinetune(page, 'script');
    await page.locator('#btnAiHelpScript').click();
    const scriptPrompt = await eBuildAiPrompt(page, 'Rows of orders as a list of maps');
    expect(scriptPrompt).toMatch(/"tableName":\s*"(dash_demo\.)?orders"/);
    await page.locator('#btnDismissAiHelp').click();
    await expect(page.locator('#txtAiRequirement')).toHaveCount(0);

    // DSL: a chart's DSL editor. The widget's SQL was written by hand above, so the Visual tab
    // asks before it takes the query back (D3) - the helper answers Switch.
    await goToVisualTab(page);
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    await page.locator('#btnDisplayTab').click();
    await openDslEditor(page);
    await page.locator('#btnAiHelpDsl').click();
    const dslPrompt = await eBuildDslPrompt(page, 'Show the bars in descending order');
    expect(dslPrompt.length).toBeGreaterThan('Show the bars in descending order'.length);
    await page.locator('#btnCopyDslPrompt').click();
    expect(await eClipboardText(page)).toBe(dslPrompt);
    await page.locator('#btnCloseDslHelp').click();
    await expect(page.locator('#txtDslRequirement')).toHaveCount(0);

    // Filters.
    await page.locator('#btnConfigureFilters').click();
    await page.locator('#btnFilterDslToggle').click();
    await page.locator('#btnAiHelpFilters').click();
    const filtersPrompt = await eBuildDslPrompt(page, 'A date range and a channel list');
    expect(filtersPrompt.length).toBeGreaterThan('A date range and a channel list'.length);
    await page.locator('#btnCloseDslHelp').click();
    await expect(page.locator('#txtDslRequirement')).toHaveCount(0);
    await page.locator('#btnDoneFilters').click();
  });
});

test('(canvas mechanics) M26 View SQL', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M26 View SQL', async () => {
    await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'SUM', 'total_amount');

    // + View SQL shows the generated statement with the table and the aggregation.
    await expect(page.locator('#btnToggleVisualSql')).toHaveText(/View SQL/);
    await page.locator('#btnToggleVisualSql').click();
    await expect(page.locator('#btnToggleVisualSql')).toHaveText(/Hide SQL/);
    const sql = page.locator('#preVisualSql');
    await expect(sql).toContainText('"dash_demo"."orders"');
    await expect(sql).toContainText(/SUM\("total_amount"\)/);
    await expect(sql).toContainText(/GROUP BY "channel"/);

    // − Hide SQL hides it.
    await page.locator('#btnToggleVisualSql').click();
    await expect(page.locator('#preVisualSql')).toHaveCount(0);
    await expect(page.locator('#btnToggleVisualSql')).toHaveText(/View SQL/);
  });
});

test('(canvas mechanics) M27 Pastel and Mono palettes', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M27 Palettes', async (canvasId) => {
    const id = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    const defaultColour = await eFirstDatasetColour(page, id);

    const pick = async (palette: string) => {
      await page.locator('#btnDisplayTab').click();
      await page.locator(`#btnChartPalette-${palette}`).click();
      await page.waitForTimeout(600);
      await page.locator('#btnDataTab').click();
      await page.waitForTimeout(300);
    };

    // + pastel and mono change the drawn colour and are stored in the chart's DSL.
    await pick('pastel');
    await expect.poll(() => eFirstDatasetColour(page, id), { timeout: 15_000 }).toBe('#a8dadc');
    let stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.palette === 'pastel');
    expect(stored[0].displayConfig.dslConfig.palette).toBe('pastel');

    await pick('mono');
    await expect.poll(() => eFirstDatasetColour(page, id), { timeout: 15_000 }).toBe('#1a1a1a');
    stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.palette === 'mono');
    expect(stored[0].displayConfig.dslConfig.palette).toBe('mono');

    // − Default restores the default colours and drops the key.
    await pick('default');
    await expect.poll(() => eFirstDatasetColour(page, id), { timeout: 15_000 }).toBe(defaultColour);
    stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.palette === undefined);
    expect(stored[0].displayConfig.dslConfig.palette).toBeUndefined();
  });
});

test('(canvas mechanics) M28 iFrame title and sandbox', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M28 iFrame', async () => {
      // A data widget so the dashboard has something to publish besides the frames.
      await addTableToCanvas(page, 'dash_demo.geo_cities');

      // + a frame with its own title and sandbox.
      await addUIElement(page, 'iframe');
      await selectLastWidget(page);
      await page.locator('#txtIframeUrl').fill(`${SERVER_URL}/`);
      await page.locator('#txtIframeTitle').fill('Mechanics frame');
      await page.locator('#txtIframeSandbox').fill('allow-scripts allow-forms');

      // − a second frame whose sandbox is never touched.
      await addUIElement(page, 'iframe');
      await selectLastWidget(page);
      await page.locator('#txtIframeUrl').fill(`${SERVER_URL}/?second`);
      await expect(page.locator('#txtIframeSandbox'), 'the panel shows the default').toHaveValue(
        'allow-scripts allow-same-origin allow-popups allow-forms');

      const published = await publishDashboard(page);
      reportId = published.reportId;
      const template = await fetch(`${SERVER_URL}/api/reports/${published.reportId}/template`, {
        headers: Helpers.apiKeyHeader(),
      }).then((r) => r.text());
      expect(template).toContain('title="Mechanics frame" sandbox="allow-scripts allow-forms"');
      expect(template, 'the untouched frame keeps the default title and sandbox').toContain(
        'title="Embedded content" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M29 Escape to deselect', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M29 Escape', async () => {
    await addTableToCanvas(page, 'dash_demo.geo_cities');

    // + Escape with a widget selected closes the config panel and clears the selection.
    await selectLastWidget(page);
    await expect(page.locator('#configPanel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#configPanel'), 'the config panel closed').toBeHidden({ timeout: 10_000 });

    // − Escape typed inside the filter dialog closes only the dialog; the widget stays selected.
    await selectLastWidget(page);
    await expect(page.locator('#configPanel')).toBeVisible();
    await page.locator('#btnConfigureFilters').click();
    await page.locator('#dlgFilterBarConfig').waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('#btnAddParameter').click();
    await page.locator('#inputParamLabel-param1').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlgFilterBarConfig'), 'the dialog closed').toHaveCount(0);
    await expect(page.locator('#configPanel'), 'the selection stayed').toBeVisible();
  });
});

test('(canvas mechanics) M30 Sort direction', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M30 Sort direction', async () => {
    const amounts = frozenRows('orders').map((r) => Number(r.total_amount));
    const lowest = Math.min(...amounts);
    const highest = Math.max(...amounts);

    const id = await eNewVisualWidget(page, 'orders');
    await setVisualLimit(page, 5);
    await addVisualSort(page, 0, 'total_amount', 'ASC');
    await runVisualQuery(page);

    // + ascending starts at the lowest amount, descending at the highest.
    await expect
      .poll(async () => Number((await eWidgetRows(page, id))[0].total_amount), { timeout: 20_000 })
      .toBeCloseTo(lowest, 2);
    await page.locator('#selectSortDir-0').selectOption('DESC');
    await runVisualQuery(page);
    await expect
      .poll(async () => Number((await eWidgetRows(page, id))[0].total_amount), { timeout: 20_000 })
      .toBeCloseTo(highest, 2);

    // − removing the sort removes ORDER BY from the statement, and the first rows are neither extreme.
    await page.locator('#btnToggleVisualSql').click();
    await expect(page.locator('#preVisualSql')).toContainText(/ORDER BY .*DESC/);
    await page.locator('#btnRemoveSort-0').click();
    await runVisualQuery(page);
    await expect(page.locator('#preVisualSql')).not.toContainText('ORDER BY');
    await expect
      .poll(async () => Number((await eWidgetRows(page, id))[0].total_amount), { timeout: 20_000 })
      .not.toBeCloseTo(highest, 2);
    expect(Number((await eWidgetRows(page, id))[0].total_amount)).not.toBeCloseTo(lowest, 2);
  });
});

test('(canvas mechanics) M31 MIN, MAX and AVG', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M31 MIN MAX AVG', async () => {
    const amounts = frozenRows('orders').map((r) => Number(r.total_amount));
    const id = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'MIN', 'total_amount');
    await runVisualQuery(page);

    // + each aggregation of total_amount equals its truth.
    expect(await eAggregateOf(page, id, 'MIN')).toBeCloseTo(Math.min(...amounts), 2);
    expect(await eAggregateOf(page, id, 'MAX')).toBeCloseTo(Math.max(...amounts), 2);
    expect(await eAggregateOf(page, id, 'AVG')).toBeCloseTo(amounts.reduce((a, b) => a + b, 0) / amounts.length, 1);

    // − AVG over a filter nothing passes is empty, never NaN.
    await addVisualFilter(page, 0, 'total_amount', 'greater_than', '1000000000');
    await runVisualQuery(page);
    await expect
      .poll(async () => (await eWidgetText(page, id)).includes('NaN'), { timeout: 10_000 })
      .toBe(false);
    const rows = await eWidgetRows(page, id);
    expect(Object.values(rows[0])[0], 'the average of nothing is null').toBeNull();
  });
});

test('(canvas mechanics) D01 every TODO 5e defect fix works', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  const canvasName = 'E2E mech D01 defect fixes';
  const OLD_TEXT_HINT = 'Edit text in the Display tab';
  const NEW_TEXT_HINT = 'Edit the text in the panel on the right';
  const OLD_CONNECTION_HINT = "any widget's Data tab";
  const NEW_CONNECTION_HINT = 'Pick a connection in the left panel (Data Source) first';
  let reportId: string | undefined;

  try {
    await withFreshCanvas(page, canvasName, async (canvasId) => {
      // Three widgets, in this order: an empty Text (T), a table of orders (B), a table of customers (C).
      await addUIElement(page, 'text');
      const tId = (await fWidgetIds(page))[0];
      const bId = await fAddTabulator(page, 'dash_demo.orders',
        'SELECT order_id, total_amount, status FROM dash_demo.orders LIMIT 20');
      const cId = await fAddTabulator(page, 'dash_demo.customers',
        'SELECT customer_id, segment FROM dash_demo.customers LIMIT 20');
      expect(await fWidgetIds(page), 'the canvas holds T, B and C').toEqual([tId, bId, cId]);

      // 1. TODO 5e item 1: the redo shortcut (Ctrl/Cmd+Shift+Z) fires.
      //    + delete a widget → Ctrl+Z brings it back → Ctrl+Shift+Z removes it again.
      //    − Ctrl+Shift+Z typed inside the SQL editor does not redo on the canvas.
      await fSelectWidget(page, tId);
      await page.locator(`[id="btnDeleteWidget-${tId}"]`).click();
      await expect.poll(() => fWidgetIds(page), { message: 'the Text widget is deleted' }).toEqual([bId, cId]);
      await page.keyboard.press('Control+z');
      await expect.poll(() => fWidgetIds(page), { message: 'Ctrl+Z brings it back' }).toEqual([tId, bId, cId]);
      await page.keyboard.press('Control+Shift+Z');
      await expect.poll(() => fWidgetIds(page), { message: 'Ctrl+Shift+Z redoes the delete' }).toEqual([bId, cId]);
      await page.keyboard.press('Control+z');
      await expect.poll(() => fWidgetIds(page), { message: 'and Ctrl+Z brings it back once more' }).toEqual([tId, bId, cId]);
      await fSelectWidget(page, bId);
      await page.locator('#btnQueryTab-finetune').click();
      const sqlEditor = page.locator('#sqlEditorInput');
      await sqlEditor.waitFor({ state: 'visible', timeout: 5_000 });
      await sqlEditor.click();
      await page.keyboard.press('Control+Shift+Z');
      await page.waitForTimeout(500);
      expect(await fWidgetIds(page), 'Ctrl+Shift+Z inside the SQL editor redoes nothing on the canvas')
        .toEqual([tId, bId, cId]);
      await page.waitForTimeout(2_500); // autosave

      // 2. TODO 5e item 2: the canvas list shows Share for a published canvas.
      //    + publish → back to /explore-data → #btnShareCanvas-{id} is visible and opens #shareDialog.
      //    − a second, never-published canvas shows no #btnShareCanvas-{id}.
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await page.goto(CANVAS_LIST_URL);
      await page.locator(`[id="canvasCard-${canvasId}"]`).hover();
      await expect(page.locator(`[id="btnShareCanvas-${canvasId}"]`), 'the published canvas offers Share')
        .toBeVisible({ timeout: 15_000 });
      await page.locator(`[id="btnShareCanvas-${canvasId}"]`).click({ force: true });
      await expect(page.locator('#shareDialog'), 'Share opens the share dialog').toBeVisible({ timeout: 10_000 });
      await page.locator('#overlayShareDialog').click({ position: { x: 5, y: 5 } });
      await expect(page.locator('#shareDialog')).toBeHidden({ timeout: 5_000 });
      const neverPublished = 'E2E mech D01 never published';
      await createFreshCanvas(page, CANVAS_LIST_URL, neverPublished);
      const otherId = canvasIdOf(page);
      try {
        await page.goto(CANVAS_LIST_URL);
        await expect(page.locator(`[id="canvasCard-${otherId}"]`), 'the new canvas is on the list')
          .toBeVisible({ timeout: 15_000 });
        await expect(page.locator(`[id="btnShareCanvas-${otherId}"]`), 'a never-published canvas offers no Share')
          .toHaveCount(0);
      } finally {
        await deleteCanvasViaUI(page, otherId);
      }

      // 3. TODO 5e item 3: Tabulator column settings are saved.
      //    + gear on a Tabulator column → new title + currency → reload the canvas → still there → publish → the published Tabulator shows them.
      //    − a Tabulator with no column settings stores no columnSettings field and renders its columns as before.
      await fReopenCanvas(page, canvasId, bId);
      await fSelectWidget(page, bId);
      const gear = `btnColumnSettings-${bId}-total_amount`;
      await setColumnTitle(page, gear, 'Order total');
      await fSetColumnViewAs(page, gear, 'currency');
      await page.waitForTimeout(2_500); // autosave
      await fReopenCanvas(page, canvasId, bId);
      const saved = await fSavedState(page, canvasId);
      const byId = (id: string) => saved.widgets.find((w) => w.id === id)!;
      expect(byId(bId).displayConfig.columnSettings?.total_amount, 'the gear settings are stored and survive a reload')
        .toMatchObject({ columnTitle: 'Order total', viewAs: 'currency' });
      expect(await fTabulatorText(page, `widgetViz-${bId}`), 'the reloaded canvas shows the new title').toContain('Order total');
      const again = await publishDashboard(page);
      expect(again.reportId, 'publishing again keeps the report').toBe(reportId);
      await openPublished(page, reportId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pubB = `widgetTabulator-${canvasComponentId(byId(bId) as any)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pubC = `widgetTabulator-${canvasComponentId(byId(cId) as any)}`;
      await expect.poll(() => fTabulatorText(page, pubB), { message: 'the published table shows the new title', timeout: 60_000 })
        .toContain('Order total');
      expect(byId(cId).displayConfig.columnSettings, 'an untouched Tabulator stores no columnSettings').toBeUndefined();
      const untouched = await fTabulatorText(page, pubC);
      // A published table made from its data heads a query-named column the way a reader writes it
      // (shared/column-titles): `segment` is "Segment".
      expect(untouched, 'and renders its columns as before').toContain('Segment');
      expect(untouched).not.toContain('Order total');

      // 4. TODO 5e item 4: the two DSL toggles have distinct ids.
      //    + with a widget selected, open #btnConfigureFilters → #btnDslToggle and #btnFilterDslToggle are each found exactly once; each opens its own editor.
      //    − no element carries #btnDslToggle inside the filter dialog.
      await fReopenCanvas(page, canvasId, bId);
      await fSelectWidget(page, bId);
      await page.locator('#btnDisplayTab').click();
      await expect(page.locator('#btnDslToggle'), 'the widget DSL toggle is found once').toHaveCount(1);
      await page.locator('#btnConfigureFilters').click();
      await page.locator('#dlgFilterBarConfig').waitFor({ state: 'visible', timeout: 5_000 });
      await expect(page.locator('#btnDslToggle'), 'still once with the filter dialog open').toHaveCount(1);
      await expect(page.locator('#btnFilterDslToggle'), 'the filter DSL toggle is found once').toHaveCount(1);
      await expect(page.locator('#dlgFilterBarConfig #btnDslToggle'), 'the filter dialog holds no #btnDslToggle').toHaveCount(0);
      await page.locator('#btnFilterDslToggle').click();
      await expect(page.locator('#filterDslEditorContainer'), 'the filter toggle opens the filter editor').toBeVisible();
      await page.locator('#btnDoneFilters').click();
      await page.locator('#dlgFilterBarConfig').waitFor({ state: 'hidden', timeout: 5_000 });
      await page.locator('#btnDslToggle').click();
      await expect(page.locator('#dslEditorContainer'), 'the widget toggle opens the widget editor').toBeVisible();

      // 5. TODO 5e item 5: the Text widget's empty-state hint names the right place.
      //    + an empty Text widget shows the new wording.
      //    − the old "Edit text in the Display tab" appears nowhere on the page.
      await expect(page.locator(`[id="txtTextEmptyHint-${tId}"]`), 'the empty Text widget says where to write')
        .toHaveText(NEW_TEXT_HINT);
      await expect(page.locator('body'), 'the old wording is nowhere').not.toContainText(OLD_TEXT_HINT);

      // 6. TODO 5e item 6: the publish "no connection" warning points to the left panel.
      //    + a canvas with #option-conn-none selected → #btnPublishDashboard → the warning names the left panel.
      //    − the old "any widget's Data tab" wording appears nowhere in the dialog.
      await page.locator('#selectConnection').selectOption('');
      await page.locator('#btnPublishDashboard').click();
      await page.locator('#dlgExportDialog').waitFor({ state: 'visible', timeout: 5_000 });
      await expect(page.locator('#publishWarnNoConnection'), 'the warning names the left panel')
        .toHaveText(NEW_CONNECTION_HINT);
      await expect(page.locator('#dlgExportDialog'), 'the old wording is nowhere in the dialog')
        .not.toContainText(OLD_CONNECTION_HINT);
      await page.locator('#btnPublishCancel').click();
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

  // ──────────────────────────────────────────────────────────
  // M32 — Multi-select and radio controls
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M32 Multi-select and radio controls', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M32 Multi-select and radio', async () => {
      await addFilterBarParam(page, G1_FILTER_DSL);
      const open = async () => {
        await page.locator('#pick').click();
        await expect(page.locator('#pick_modal')).toBeVisible();
      };

      // + the dialog opens with paging (120 options, 50 a page); − Previous is dead on page 1.
      await open();
      await expect(page.locator('#pick_modal [id^="pick_cb_"]')).toHaveCount(50);
      await expect(page.locator('#pick_btnPrevPage')).toBeDisabled();
      const page1 = await page.locator('#pick_lblPagePos').innerText();
      await page.locator('#pick_btnNextPage').click();
      await expect(page.locator('#pick_lblPagePos'), 'Next moves the page').not.toHaveText(page1);
      await expect(page.locator('#pick_btnPrevPage')).toBeEnabled();
      await page.locator('#pick_btnPrevPage').click();
      await expect(page.locator('#pick_lblPagePos')).toHaveText(page1);

      // + None empties, All fills (the count says so).
      await page.locator('#pick_btnNone').click();
      await expect(page.locator('#pick_lblCount')).toContainText('0 selected');
      await page.locator('#pick_btnAll').click();
      await expect(page.locator('#pick_lblCount')).toContainText('All');

      // + the search narrows the list to what was typed; − clearing it brings the page back.
      const firstId = await page.locator('#pick_modal [id^="pick_cb_"]').first().getAttribute('id');
      const firstValue = firstId!.substring('pick_cb_'.length);
      await page.locator('#pick_search').fill(firstValue);
      const found = await page.locator('#pick_modal [id^="pick_cb_"]').count();
      expect(found, 'the search finds the typed option').toBeGreaterThan(0);
      expect(found, 'and fewer than a full page').toBeLessThan(50);
      await page.locator('#pick_search').fill('');
      await expect(page.locator('#pick_modal [id^="pick_cb_"]')).toHaveCount(50);

      // + OK commits All; − Cancel then throws a later draft away; − a click on the backdrop does the same.
      await page.locator('#pick_btnOk').click();
      await expect(page.locator('#pick_modal')).not.toBeVisible();
      await open();
      await expect(page.locator('#pick_lblCount'), 'OK kept All').toContainText('All');
      await page.locator('#pick_btnNone').click();
      await page.locator('#pick_btnCancel').click();
      await expect(page.locator('#pick_modal')).not.toBeVisible();
      await open();
      await expect(page.locator('#pick_lblCount'), 'Cancel kept the old selection').not.toContainText('0 selected');
      await page.locator('#pick_btnNone').click();
      await page.locator('#pick_modalOverlay').click({ position: { x: 5, y: 5 } });
      await expect(page.locator('#pick_modal')).not.toBeVisible();
      await open();
      await expect(page.locator('#pick_lblCount'), 'the backdrop kept the old selection').not.toContainText('0 selected');

      // + OK commits the draft.
      await page.locator('#pick_btnNone').click();
      await page.locator('#pick_btnOk').click();
      await expect(page.locator('#pick_modal')).not.toBeVisible();
      await open();
      await expect(page.locator('#pick_lblCount'), 'OK kept the empty selection').toContainText('0 selected');
      await page.locator('#pick_btnCancel').click();

      // Radio: one option is on, the others off; picking another swaps them.
      const radios = page.locator('#mode [id^="mode_rb_"]');
      expect(await radios.count(), 'a radio per channel').toBeGreaterThan(1);
      const firstRb = (await radios.nth(0).getAttribute('id'))!;
      const secondRb = (await radios.nth(1).getAttribute('id'))!;
      await page.locator(`[id="${firstRb}"]`).check();
      await expect(page.locator(`[id="${firstRb}"]`)).toBeChecked();
      await expect(page.locator(`[id="${secondRb}"]`)).not.toBeChecked();
      await page.locator(`[id="${secondRb}"]`).check();
      await expect(page.locator(`[id="${secondRb}"]`)).toBeChecked();
      await expect(page.locator(`[id="${firstRb}"]`)).not.toBeChecked();
    });
  });

  // ──────────────────────────────────────────────────────────
  // M33 — Share link attributes
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M33 Share link attributes', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M33 Share attributes', async () => {
        await g1AddNumber(page);
        reportId = (await publishDashboard(page)).reportId;

        await page.locator('#btnShareDashboard').click();
        await page.locator('#shareDialog').waitFor({ state: 'visible', timeout: 10_000 });

        // − a bad name is refused and no link is made.
        const bad = await g1AddAttr(page, 'Bad Name', 'x');
        await page.locator('#btnCreateShareLink').click();
        await expect(page.locator('#shareError')).toContainText('cannot be used as an attribute name');
        await expect(page.locator('#tableShareLinks [id^="shareLink-"]')).toHaveCount(0);

        // − Remove takes the row away.
        await page.locator(`[id="btnRemoveShareAttribute-${bad}"]`).click();
        await expect(page.locator('[id^="shareAttrName-"]')).toHaveCount(0);

        // + a good name and value make a link that lists them in "For".
        await g1AddAttr(page, 'team', 'sales');
        await page.locator('#btnCreateShareLink').click();
        await page.locator('#shareNewUrl').waitFor({ state: 'visible', timeout: 15_000 });
        const row = page.locator('#tableShareLinks [id^="shareLink-"]');
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('team');
        await expect(row).toContainText('sales');

        // Take the link back, then close.
        const linkId = (await row.getAttribute('id'))!.substring('shareLink-'.length);
        await page.locator(`[id="btnRevokeShareLink-${linkId}"]`).click();
        await page.locator('#btnShareClose').click();
        await expect(page.locator('#shareDialog')).not.toBeVisible();
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ──────────────────────────────────────────────────────────
  // M34 — Apply reloads without a question (published page, #18)
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M34 Apply reloads without a question', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M34 Apply at once', async () => {
        await addFilterBarParam(page, G1_SMALL_DSL);
        await g1AddNumber(page);
        reportId = (await publishDashboard(page)).reportId;

        await openPublished(page, reportId);
        await page.evaluate(() => ((window as unknown as { __m34: number }).__m34 = 1));

        // + Apply reloads the widgets in place: no Yes/No question, and the page itself stays.
        await expect(page.locator('#btnReloadDashboard')).toHaveText('Apply');
        await page.locator('#btnReloadDashboard').click();
        await expect(page.locator('#btnConfirmReload'), 'no question asked').toHaveCount(0);
        await expect(page.locator('#btnCancelReload')).toHaveCount(0);
        await expect(page.locator('#btnReloadDashboard')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __m34?: number }).__m34), 'the page did not navigate').toBe(1);
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ──────────────────────────────────────────────────────────
  // M35 — Filter bar dialog
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M35 Filter bar dialog', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M35 Filter bar dialog', async () => {
      // + an empty bar offers a Configure tile that opens the dialog.
      await page.locator('#btnConfigureFilterBar').click();
      await expect(page.locator('#dlgFilterBarConfig')).toBeVisible();

      // − a click on the backdrop closes it and nothing is added.
      await page.locator('#overlayFilterBarConfig').click({ position: { x: 5, y: 5 } });
      await expect(page.locator('#dlgFilterBarConfig')).not.toBeVisible();
      await expect(page.locator('#formReportParameters')).toHaveCount(0);

      // + a parameter shows its id in a box of its own, which the author may type over (M65 types one).
      await addFilterBarParam(page, G1_SMALL_DSL);
      await page.locator('#btnConfigureFilters').click();
      const idInput = page.locator('[id="inputParamId-channel"]');
      await expect(idInput).toBeVisible();
      await expect(idInput).toHaveValue('channel');
      await expect(idInput, 'the id can be typed over').toBeEditable();
      await page.locator('#btnCloseFilterConfig').click();
      await expect(page.locator('#dlgFilterBarConfig')).not.toBeVisible();
      // − with a filter in place the empty-bar tile is gone.
      await expect(page.locator('#btnConfigureFilterBar')).toHaveCount(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // M36 — Publish dialog
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M36 Publish dialog', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M36 Publish dialog', async () => {
        await g1AddNumber(page);

        // − the X and the backdrop close the dialog without publishing.
        await page.locator('#btnPublishDashboard').click();
        await expect(page.locator('#dlgExportDialog')).toBeVisible();
        await page.locator('#btnCloseExportDialog').click();
        await expect(page.locator('#dlgExportDialog')).not.toBeVisible();
        await page.locator('#btnPublishDashboard').click();
        await expect(page.locator('#dlgExportDialog')).toBeVisible();
        await page.locator('#overlayExportDialog').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#dlgExportDialog')).not.toBeVisible();
        await expect(page.locator('#btnShareDashboard'), 'nothing was published').toHaveCount(0);

        // + confirm: the success view links to the page; Close ends it.
        await page.locator('#btnPublishDashboard').click();
        await page.locator('#btnPublishConfirm').click();
        const link = page.locator('#lnkViewPublishedDashboard');
        await link.waitFor({ state: 'visible', timeout: 60_000 });
        const href = (await link.getAttribute('href'))!;
        expect(href).toContain('/dashboard/');
        reportId = href.split('/dashboard/')[1].split(/[?#]/)[0];
        await page.locator('#btnPublishClose').click();
        await expect(page.locator('#dlgExportDialog')).not.toBeVisible();
        await expect(page.locator('#btnShareDashboard')).toBeVisible();
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M37 — Column settings: number options of a Tabulator column
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M37 Column settings number options', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M37 Column number settings', async (canvasId) => {
      const widgetId = await fAddTabulator(page, 'dash_demo.orders', 'SELECT 12345.678 AS score');
      const gear = `btnColumnSettings-${widgetId}-score`;

      // − nothing touched: the number is drawn plain and nothing is stored.
      await g2TableShows(page, widgetId, /12,345\.68/, 'the plain number');
      expect(await g2Stored(page, canvasId, 'score'), 'no column settings yet').toBeUndefined();

      // + Style "Currency": the value gets a $ and the currency pickers appear.
      await g2Edit(page, gear, async () => {
        await expect(page.locator('#selectColumnCurrency'), '− a plain number has no currency picker').toHaveCount(0);
        await expect(page.locator('#selectColumnDateUnit'), '− a number has no date granularity').toHaveCount(0);
        await page.locator('#selectColumnNumberStyle').selectOption('currency');
        await expect(page.locator('#selectColumnCurrency')).toBeVisible();
        await expect(page.locator('#selectColumnCurrencyStyle')).toBeVisible();
      });
      await g2TableShows(page, widgetId, /\$12,345\.68/, 'the value is currency');

      // + Unit of currency: EUR.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrency').selectOption('EUR');
      });
      await g2TableShows(page, widgetId, /€12,345\.68/, 'euro sign');

      // + Currency label style: code, then name, then symbol again.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('code');
      });
      await g2TableShows(page, widgetId, /EUR\s*12,345\.68/, 'the code');
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('name');
      });
      await g2TableShows(page, widgetId, /12,345\.68\s*euros/i, 'the name');

      // + Decimals 0 (with the symbol back).
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('symbol');
        await page.locator('#numColumnDecimals').fill('0');
      });
      await g2TableShows(page, widgetId, /€12,346(?![.\d])/, 'no decimals');

      // + Scale × 2.
      await g2Edit(page, gear, async () => {
        await page.locator('#numColumnScale').fill('2');
      });
      await g2TableShows(page, widgetId, /€24,691(?![.\d])/, 'the value is doubled');

      // + Prefix and suffix.
      await g2Edit(page, gear, async () => {
        await page.locator('#txtColumnPrefix').fill('net ');
        await page.locator('#txtColumnSuffix').fill(' /yr');
      });
      await g2TableShows(page, widgetId, /net .*24,691.*\/yr/, 'prefix and suffix');

      // + Compact notation shortens the number; − unticking it brings the full number back.
      await g2Edit(page, gear, async () => {
        await page.locator('#chkColumnCompact').check();
      });
      await g2TableShows(page, widgetId, /\dK/, 'compact notation');
      await g2TableLacks(page, widgetId, /24,691/, 'the long number is gone');
      await g2Edit(page, gear, async () => {
        await page.locator('#chkColumnCompact').uncheck();
      });
      await g2TableShows(page, widgetId, /24,691/, 'the long number is back');

      // + Style "Percent": a %, and the currency pickers go again.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnNumberStyle').selectOption('percent');
        await expect(page.locator('#selectColumnCurrency'), '− percent has no currency picker').toHaveCount(0);
      });
      await g2TableShows(page, widgetId, /24,691%/, 'percent');

      // + Style "Scientific" is stored and the % is gone.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnNumberStyle').selectOption('scientific');
      });
      await g2TableLacks(page, widgetId, /%/, 'no percent any more');

      // + every setting was stored.
      await expect
        .poll(async () => g2Stored(page, canvasId, 'score'), { message: 'the settings are stored', timeout: 20_000 })
        .toMatchObject({
          numberStyle: 'scientific',
          currency: 'EUR',
          currencyStyle: 'symbol',
          decimals: 0,
          scale: 2,
          prefix: 'net ',
          suffix: ' /yr',
        });
      expect((await g2Stored(page, canvasId, 'score'))?.compact, 'the unticked compact is not stored').toBeUndefined();

      // + the X closes the panel and keeps what was set; so does a click on the dark area.
      await g2OpenAndClose(page, gear, 'x');
      expect((await g2Stored(page, canvasId, 'score'))?.scale, 'X keeps the settings').toBe(2);
      await g2OpenAndClose(page, gear, 'overlay');
      expect((await g2Stored(page, canvasId, 'score'))?.prefix, 'the overlay click keeps the settings').toBe('net ');
      await g2TableShows(page, widgetId, /net .*24,691/, 'the table still shows them');

      // − "Display as: Plain text" takes the number controls away.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnViewAs').selectOption('text');
        await expect(page.locator('#numColumnScale')).toHaveCount(0);
        await expect(page.locator('#txtColumnPrefix')).toHaveCount(0);
        await expect(page.locator('#txtColumnSuffix')).toHaveCount(0);
        await expect(page.locator('#chkColumnCompact')).toHaveCount(0);
        await expect(page.locator('#selectColumnNumberStyle')).toHaveCount(0);
        await page.locator('#btnResetColumnSettings').click();
      });
      await g2TableShows(page, widgetId, /12,345\.68/, 'reset brings the plain number back');
      await expect
        .poll(async () => g2Stored(page, canvasId, 'score'), { timeout: 20_000 })
        .toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M38 — Column settings: date granularity of a Tabulator column
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M38 Column settings date granularity', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M38 Column date settings', async (canvasId) => {
      const widgetId = await fAddTabulator(
        page,
        'dash_demo.orders',
        "SELECT TIMESTAMP '2026-05-15 12:00:00' AS shipped_on, 3 AS q_no",
      );
      const dateGear = `btnColumnSettings-${widgetId}-shipped_on`;
      const quarterGear = `btnColumnSettings-${widgetId}-q_no`;

      // − nothing touched: the date is drawn in full; the number column has no date granularity.
      await g2TableShows(page, widgetId, /May 15, 2026/, 'the full date');
      expect(await g2Stored(page, canvasId, 'shipped_on'), 'no column settings yet').toBeUndefined();

      // + Year, then Quarter, then Month.
      await g2Edit(page, dateGear, async () => {
        await expect(page.locator('#numColumnScale'), '− a date has no number section').toHaveCount(0);
        await page.locator('#selectColumnDateUnit').selectOption('year');
      });
      await g2TableShows(page, widgetId, /2026/, 'year');
      await g2TableLacks(page, widgetId, /May/, 'year only');
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('quarter');
      });
      await g2TableShows(page, widgetId, /Q2 2026/, 'quarter');
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('month');
      });
      await g2TableShows(page, widgetId, /May 2026/, 'month');
      await g2TableLacks(page, widgetId, /May 15/, 'no day any more');
      await expect
        .poll(async () => (await g2Stored(page, canvasId, 'shipped_on'))?.dateUnit, { message: 'the unit is stored', timeout: 20_000 })
        .toBe('month');

      // + an extraction unit on a plain number shown as a date: 3 becomes Q3.
      await g2TableLacks(page, widgetId, /Q3/, 'no Q3 before');
      await g2Edit(page, quarterGear, async () => {
        await page.locator('#selectColumnViewAs').selectOption('date');
        await page.locator('#selectColumnDateUnit').selectOption('quarter-of-year');
      });
      await g2TableShows(page, widgetId, /Q3/, 'quarter of year');
      await expect
        .poll(async () => g2Stored(page, canvasId, 'q_no'), { timeout: 20_000 })
        .toMatchObject({ viewAs: 'date', dateUnit: 'quarter-of-year' });

      // + "Auto" takes the unit away again.
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('auto');
      });
      await g2TableShows(page, widgetId, /May 15, 2026/, 'the full date is back');
      await expect
        .poll(async () => (await g2Stored(page, canvasId, 'shipped_on'))?.dateUnit, { timeout: 20_000 })
        .toBeUndefined();

      // − "Display as: Plain text" takes the granularity away.
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnViewAs').selectOption('text');
        await expect(page.locator('#selectColumnDateUnit')).toHaveCount(0);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M39 — Detail: visible columns and a column's settings
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M39 Detail visible columns', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M39 Detail visible columns', async (canvasId) => {
      await addTableToCanvas(page, 'dash_demo.orders');
      await runSqlQuery(page, "SELECT 'Acme' AS company, 12345.678 AS score, 'Berlin' AS city");
      await switchToWidget(page, 'detail');
      const detailId = await getLastWidgetId(page);
      const detail = page.locator(`[id="widgetViz-${detailId}"]`);
      await expect(detail).toContainText('Berlin', { timeout: 30_000 });
      await page.locator('#btnDisplayTab').click();
      await page.locator('#configPanel-detail').waitFor({ state: 'visible', timeout: 10_000 });

      const hidden = async () => (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.hiddenColumns;

      // − all three are ticked and nothing is hidden.
      for (const column of ['company', 'score', 'city']) {
        await expect(page.locator(`[id="cbDetailColumn-${column}"]`)).toBeChecked();
      }

      // + untick city: its value goes, the others stay, and the hidden list is stored.
      await page.locator('[id="cbDetailColumn-city"]').uncheck();
      await expect(detail).not.toContainText('Berlin');
      await expect(detail).toContainText('Acme');
      await expect.poll(hidden, { message: 'city is stored as hidden', timeout: 20_000 }).toEqual(['city']);

      // + untick company too.
      await page.locator('[id="cbDetailColumn-company"]').uncheck();
      await expect(detail).not.toContainText('Acme');
      await expect.poll(hidden, { timeout: 20_000 }).toEqual(expect.arrayContaining(['city', 'company']));

      // − tick city again: the value is back and only company stays hidden.
      await page.locator('[id="cbDetailColumn-city"]').check();
      await expect(detail).toContainText('Berlin');
      await expect(detail).not.toContainText('Acme');
      await expect.poll(hidden, { timeout: 20_000 }).toEqual(['company']);
      await page.locator('[id="cbDetailColumn-company"]').check();
      await expect(detail).toContainText('Acme');
      await expect.poll(hidden, { timeout: 20_000 }).toEqual([]);

      // + a Detail column's gear takes the same settings: a suffix on the score.
      await g2Edit(page, `${detailId}_btnColumnSettings-score`, async () => {
        await page.locator('#txtColumnSuffix').fill(' pts');
        await page.locator('#numColumnScale').fill('2');
      });
      await expect(detail).toContainText('pts');
      await expect(detail).toContainText(/24,691/);
      await expect
        .poll(async () => g2Stored(page, canvasId, 'score'), { timeout: 20_000 })
        .toMatchObject({ suffix: ' pts', scale: 2 });

      // + the X and the dark area close the panel without a change.
      await g2OpenAndClose(page, `${detailId}_btnColumnSettings-score`, 'x');
      await g2OpenAndClose(page, `${detailId}_btnColumnSettings-score`, 'overlay');
      await expect(detail).toContainText('pts');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M40 — DSL help and DSL example dialogs
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M40 DSL help and example dialogs', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M40 DSL dialogs', async () => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: AI_HUB_BASE_URL });
      await addTableToCanvas(page, 'dash_demo.products');
      await switchToWidget(page, 'tabulator');
      await page.locator('#btnDisplayTab').click();
      await openDslEditor(page);

      // + the DSL help dialog links to the AI assistant that was set up; Dismiss closes it.
      await page.locator('#btnAiHelpDsl').click();
      await expect(page.locator('#txtDslRequirement')).toBeVisible();
      const link = page.locator('#lnkDslAiUrl');
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', /^https?:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await page.locator('#btnDismissDslHelp').click();
      await expect(page.locator('#txtDslRequirement')).toHaveCount(0);
      await expect(link).toHaveCount(0);

      // + it opens again on a new click.
      await page.locator('#btnAiHelpDsl').click();
      await expect(page.locator('#txtDslRequirement')).toBeVisible();
      await page.locator('#btnCloseDslHelp').click();
      await expect(page.locator('#txtDslRequirement')).toHaveCount(0);

      // − Dismiss on the example leaves the clipboard as it was.
      await page.evaluate(() => navigator.clipboard.writeText('g2 sentinel'));
      await page.locator('#btnShowDslExample').click();
      await expect(page.locator('#dslExampleInput')).toContainText('tabulator', { timeout: 15_000 });
      await page.locator('#btnDismissDslExample').click();
      await expect(page.locator('#dslExampleContainer')).toHaveCount(0);
      expect(await eClipboardText(page), 'dismiss copies nothing').toBe('g2 sentinel');

      // + Copy puts the example on the clipboard.
      await page.locator('#btnShowDslExample').click();
      await expect(page.locator('#dslExampleInput')).toContainText('tabulator', { timeout: 15_000 });
      await page.locator('#btnCopyDslExample').click();
      await expect
        .poll(() => eClipboardText(page), { message: 'the example is on the clipboard', timeout: 10_000 })
        .toContain('tabulator');
      await page.locator('#btnCloseDslExample').click();
      await expect(page.locator('#dslExampleContainer')).toHaveCount(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M41 — AI help dialog: assistant link and the table picker's close button
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M41 AI help assistant link and table picker', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await withFreshCanvas(page, 'E2E mech M41 AI help link', async () => {
      await addTableToCanvas(page, 'dash_demo.orders');
      await eOpenFinetune(page, 'sql');
      await runSqlQuery(page, 'SELECT order_id, total_amount FROM dash_demo.orders LIMIT 5');
      await page.locator('#btnAiHelpSql').click();
      const prompt = await eBuildAiPrompt(page, 'Revenue by channel');

      // + the link to the AI assistant opens in a new tab.
      const link = page.locator('#lnkAiHelpAssistant');
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', /^https?:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');

      // + the table picker opens; its X closes it and leaves the dialog and the prompt as they were.
      await page.locator('#btnAiHelpPickTables').click();
      await expect(page.locator('#btnPickTables')).toBeVisible();
      await page.locator('#btnCloseAiHelpTablePicker').click();
      await expect(page.locator('#btnPickTables')).toHaveCount(0);
      await expect(page.locator('#btnCloseAiHelpTablePicker')).toHaveCount(0);
      await expect(page.locator('#txtAiHelpPrompt')).toBeVisible();
      expect(await page.locator('#txtAiHelpPrompt').inputValue(), 'closing the picker changes nothing').toBe(prompt);

      // − with the dialog closed there is no link.
      await page.locator('#btnCloseAiHelp').click();
      await expect(link).toHaveCount(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M42 — Schema browser pickers: the Cubes group and the AI prompt's table picker
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M42 Schema browser: Cubes group and the AI table picker', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M42 Schema pickers', async () => {
      // + The Cubes group in the left panel: collapsing hides the cubes, opening brings them back.
      const cubeButtons = page.locator('[id^="btnCube-"]');
      await expect.poll(() => cubeButtons.count(), { timeout: 15_000 }).toBeGreaterThan(0);
      const cubeCount = await cubeButtons.count();
      await page.locator('#btnToggleCubesGroup').click();
      await expect(cubeButtons, 'a collapsed Cubes group lists no cube').toHaveCount(0);
      await page.locator('#btnToggleCubesGroup').click();
      await expect(cubeButtons, 'opened again it lists them all').toHaveCount(cubeCount);

      // The same schema browser is the AI prompt's table picker: SQL widget -> AI help -> Pick more tables.
      await addTableToCanvas(page, 'dash_demo.orders');
      await eOpenFinetune(page, 'sql');
      await page.locator('#btnAiHelpSql').click();
      await eBuildAiPrompt(page, 'Orders by channel');
      const promptBefore = await page.locator('#txtAiHelpPrompt').inputValue();

      await page.locator('#btnAiHelpPickTables').click();
      await expect(page.locator('#btnPickTables')).toBeVisible();

      // + In the picker a cube is a checkbox: ticking and unticking it flips it.
      const pickCube = page.locator('[id="chkPickCube-dd-sales"]');
      await expect(pickCube).toBeVisible({ timeout: 15_000 });
      await expect(pickCube, 'no cube is ticked to begin with').not.toBeChecked();
      await pickCube.check();
      await expect(pickCube).toBeChecked();
      await pickCube.uncheck();
      await expect(pickCube).not.toBeChecked();

      // + The picker's own Cubes group (its ids carry the picker's prefix) folds its checkboxes away.
      const pickerGroup = page.locator('#aiPick-btnToggleCubesGroup');
      await pickerGroup.click();
      await expect(page.locator('[id^="chkPickCube-"]'), 'a collapsed group lists no checkbox').toHaveCount(0);
      await pickerGroup.click();
      await expect(pickCube).toBeVisible();

      // − Close (in the picker) leaves without picking: the dialog is closed and the prompt is as it was.
      await page.locator('#btnCloseSchemaBrowser').click();
      await expect(page.locator('#btnPickTables')).toHaveCount(0);
      expect(await page.locator('#txtAiHelpPrompt').inputValue(), 'the prompt did not change').toBe(promptBefore);

      // − The picker's x does the same.
      await page.locator('#btnAiHelpPickTables').click();
      await expect(page.locator('#btnPickTables')).toBeVisible();
      await page.locator('#btnCloseAiHelpTablePicker').click();
      await expect(page.locator('#btnPickTables')).toHaveCount(0);
      expect(await page.locator('#txtAiHelpPrompt').inputValue(), 'the prompt did not change').toBe(promptBefore);

      await page.locator('#btnCloseAiHelp').click();
      await expect(page.locator('#txtAiRequirement')).toHaveCount(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M43 — The Divider: select it, delete it
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M43 Divider', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M43 Divider', async (canvasId) => {
      await addUIElement(page, 'divider');
      const dividerId = await g3DividerId(page);
      const divider = page.locator(`[id="widgetDivider-${dividerId}"]`);
      const deleteButton = page.locator(`[id="btnDeleteDivider-${dividerId}"]`);
      await expect.poll(async () => ((await aStored(page, canvasId)).widgets as unknown[]).length, { timeout: 20_000, intervals: [500] }).toBe(1);

      // − A divider nobody selected has no delete button (a divider just added is selected, so deselect it).
      await page.keyboard.press('Escape');
      await expect(deleteButton).toHaveCount(0);

      // + Selecting it (a click) shows its delete button.
      await divider.click();
      await expect(deleteButton).toBeVisible({ timeout: 10_000 });

      // − In Preview (not editing) the same selected divider offers no delete.
      await page.locator('#btnEditPreview').click();
      await expect(deleteButton).toHaveCount(0);
      await page.locator('#btnEditPreview').click();
      await divider.click();
      await expect(deleteButton).toBeVisible({ timeout: 10_000 });

      // + The button removes the divider from the canvas and from the stored state.
      await deleteButton.click();
      await expect(divider).toHaveCount(0);
      await expect.poll(async () => ((await aStored(page, canvasId)).widgets as unknown[]).length, { timeout: 20_000, intervals: [500] }).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M44 — Clicking the empty grid deselects
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M44 Click the empty canvas to deselect', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await withFreshCanvas(page, 'E2E mech M44 Deselect', async () => {
      await addUIElement(page, 'text', { textContent: 'select me' });
      const textId = await getLastWidgetId(page);

      // − Clicking the widget itself keeps it selected (its click does not reach the grid).
      await aSelectWidget(page, textId);
      await page.locator(`#widgetHeader-${textId}`).click();
      await expect(page.locator('#configPanel')).toBeVisible();

      // + A click on the grid's own padding (no widget under it) deselects: the config panel and the delete button go.
      await page.locator('#canvasGridArea').click({ position: { x: 4, y: 4 } });
      await expect(page.locator('#configPanel')).toBeHidden();
      await expect(page.locator(`#btnDeleteWidget-${textId}`)).toBeHidden();

      // − Deselecting deletes nothing: the widget is still there.
      await expect(page.locator(`#widget-${textId}`)).toContainText('select me');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // M45 — The canvas list's empty state
  // ────────────────────────────────────────────────────────────────────────────
  test('(canvas mechanics) M45 Canvas list empty state', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let createdId: string | undefined;

    try {
      // − With a canvas on the list (answered on purpose) there is no "create your first" button.
      await g3AnswerCanvasList(page, [g3FakeCanvas()]);
      await page.goto(CANVAS_LIST_URL);
      await expect(page.locator('#canvasCard-e2e-mech-m45-fake')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#btnNewCanvasEmpty')).toHaveCount(0);
      await page.unroute(/\/explorations$/);

      // + With nothing on the list (answered on purpose) the empty state offers it, and it creates a canvas and opens it.
      await g3AnswerCanvasList(page, []);
      await page.goto(CANVAS_LIST_URL);
      await expect(page.locator('#btnNewCanvasEmpty')).toBeVisible({ timeout: 30_000 });
      await page.locator('#btnNewCanvasEmpty').click();
      await page.waitForURL(/\/explore-data\/[^/]+$/, { timeout: 30_000 });
      createdId = canvasIdOf(page);
      await expect(page.locator('#btnCanvasName')).toHaveText('Untitled Canvas', { timeout: 30_000 });
    } finally {
      await page.unroute(/\/explorations$/);
      if (createdId) await deleteCanvasViaUI(page, createdId);
    }
  });

test('(canvas mechanics) M46 Remove aggregation, filter and computed rows', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M46 Remove rows', async () => {
    const orders = frozenRows('orders');

    // + an aggregation row: removing the second leaves the first, and its column leaves the answer.
    const agg = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addAggregation(page, 1, 'SUM', 'total_amount');
    await runVisualQuery(page);
    await g4RowsWhere(page, agg, (r) => Object.keys(r[0]).length === 2, 'two aggregates answer in two columns');
    await page.locator('#btnRemoveAgg-1').click();
    await expect(page.locator('#selectAggFunc-1'), 'the second aggregation row is gone').toHaveCount(0);
    await runVisualQuery(page);
    const one = await g4RowsWhere(page, agg, (r) => Object.keys(r[0]).length === 1, 'one aggregate answers in one column');
    expect(eScalar(one), 'the remaining aggregation still counts every order').toBe(orders.length);

    // − removing the last aggregation hands back the table's own rows.
    await page.locator('#btnRemoveAgg-0').click();
    await expect(page.locator('#selectAggFunc-0'), 'no aggregation row is left').toHaveCount(0);
    await runVisualQuery(page);
    await g4RowsWhere(page, agg, (r) => 'total_amount' in r[0] && 'order_id' in r[0], 'the table answers with its own columns');

    // + a filter row: removing the first leaves the second, which moves up to position 0.
    const flt = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'channel', 'equals', 'web');
    await addVisualFilter(page, 1, 'status', 'equals', 'completed');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await g4ScalarIs(page, flt,
      orders.filter((r) => r.channel === 'web' && r.status === 'completed').length, 'both filters narrow the count');
    await page.locator('#btnRemoveFilter-0').click();
    await expect(page.locator('#selectFilterCol-1'), 'one filter row is left').toHaveCount(0);
    await expect(page.locator('#selectFilterCol-0'), 'the second filter moved up').toHaveValue('status');
    await runVisualQuery(page);
    await g4ScalarIs(page, flt, orders.filter((r) => r.status === 'completed').length, 'only the status filter narrows the count');

    // − removing the last filter counts every order again.
    await page.locator('#btnRemoveFilter-0').click();
    await expect(page.locator('#selectFilterCol-0'), 'no filter row is left').toHaveCount(0);
    await runVisualQuery(page);
    await g4ScalarIs(page, flt, orders.length, 'no filter counts every order');

    // + a computed column: it is in the answer, and removing the first leaves the second.
    const cmp = await eNewVisualWidget(page, 'orders');
    await addComputedColumn(page, 0, 'double_amount', 'total_amount', '*', '2');
    await addComputedColumn(page, 1, 'half_amount', 'total_amount', '/', '2');
    await runVisualQuery(page);
    const both = await g4RowsWhere(page, cmp, (r) => 'double_amount' in r[0] && 'half_amount' in r[0], 'both computed columns are answered');
    expect(Number(both[0].double_amount)).toBeCloseTo(2 * Number(both[0].total_amount), 0);
    expect(Number(both[0].half_amount)).toBeCloseTo(Number(both[0].total_amount) / 2, 0);
    await page.locator('#btnRemoveComputed-0').click();
    await expect(page.locator('#inputComputedName-1'), 'one computed row is left').toHaveCount(0);
    await expect(page.locator('#inputComputedName-0'), 'the second computed column moved up').toHaveValue('half_amount');
    await runVisualQuery(page);
    await g4RowsWhere(page, cmp, (r) => !('double_amount' in r[0]) && 'half_amount' in r[0], 'the removed column left the answer');

    // − removing the last computed column leaves the table's own columns only.
    await page.locator('#btnRemoveComputed-0').click();
    await expect(page.locator('#inputComputedName-0'), 'no computed row is left').toHaveCount(0);
    await runVisualQuery(page);
    await g4RowsWhere(page, cmp, (r) => !('half_amount' in r[0]) && 'total_amount' in r[0], 'only the table columns remain');
  });
});

test('(canvas mechanics) M47 Unbind a between filter', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M47 Unbind between', async () => {
    const orders = frozenRows('orders');

    // Both ends of the range are dashboard dates, far in the future, so a bound range holds no order.
    await addFilterBarParam(page, `reportParameters {
  parameter(id: 'since', type: 'Date', label: 'Since', defaultValue: '2099-01-01') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
  parameter(id: 'until', type: 'Date', label: 'Until', defaultValue: '2099-12-31') {
    constraints(required: false)
    ui(control: 'datepicker')
  }
}
`);
    const id = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'order_ts', 'between');
    await bindVisualFilterToParam(page, 0, 'since');
    await bindVisualFilterToParam(page, 0, 'until', 'valueTo');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await expect(page.locator('#btnUnbindFilterBetween-0'), 'the lower end is bound to ${since}').toBeVisible();
    await expect(page.locator('#btnUnbindFilterBetweenTo-0'), 'the upper end is bound to ${until}').toBeVisible();
    await g4ScalarIs(page, id, 0, 'a range that starts in 2099 holds no order');

    // + the lower end unbound: its chip is gone, the box is empty and asks for a typed date; the upper end stays bound.
    await page.locator('#btnUnbindFilterBetween-0').click();
    await expect(page.locator('#btnUnbindFilterBetween-0'), 'the lower chip is gone').toHaveCount(0);
    await expect(page.locator('#btnUnbindFilterBetweenTo-0'), 'the upper end is still bound').toBeVisible();
    await expect(page.locator('#inputFilterValue-0'), 'a typed date is asked for').toHaveValue('');
    await page.locator('#inputFilterValue-0').fill('2000-01-01');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, orders.length, 'from the typed date to the bound end holds every order');

    // + the upper end unbound too: the typed date, not the bound one, now decides.
    await page.locator('#btnUnbindFilterBetweenTo-0').click();
    await expect(page.locator('#btnUnbindFilterBetweenTo-0'), 'the upper chip is gone').toHaveCount(0);
    await expect(page.locator('#inputFilterValueTo-0'), 'a typed date is asked for').toHaveValue('');
    await page.locator('#inputFilterValueTo-0').fill('2000-01-02');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, 0, 'a range of two days in 2000 holds no order');

    // − typing a wide range again counts every order, and no chip comes back.
    await page.locator('#inputFilterValueTo-0').fill('2099-12-31');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, orders.length, 'a typed wide range holds every order');
    await expect(page.locator('#btnUnbindFilterBetween-0')).toHaveCount(0);
    await expect(page.locator('#btnUnbindFilterBetweenTo-0')).toHaveCount(0);
  });
});

test('(canvas mechanics) M48 Numeric group-by bins', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M48 Numeric bins', async () => {
    const orders = frozenRows('orders');
    // The Visual query returns at most this many rows unless the limit is changed (inputLimit default).
    const queryLimit = 500;
    const distinctAmounts = new Set(orders.map((r) => r.total_amount)).size;

    const id = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'total_amount');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);

    // − not binned, every distinct amount is its own group (up to the limit).
    expect(distinctAmounts, 'the amounts are more distinct than the limit lets through').toBeGreaterThan(queryLimit);
    await expect(g4RowCount(page)).toContainText(`${queryLimit} rows returned`);
    await expect(page.locator('#selectNumericBin-total_amount'), 'a numeric group-by column offers bins').toHaveValue('none');

    // + 10 bins: a handful of groups that still add up to every order.
    await page.locator('#selectNumericBin-total_amount').selectOption('10');
    await runVisualQuery(page);
    // ten groups of a number and a count are drawn as a chart, and a chart keeps no rows to read: look at the table
    await switchToWidget(page, 'tabulator');
    const binned = await g4RowsWhere(page, id, (r) => r.length > 1 && r.length <= 11, 'ten bins answer in at most eleven groups');
    const countKey = Object.keys(binned[0]).find((k) => k.toLowerCase().includes('count'))!;
    expect(binned.reduce((sum, r) => sum + Number(r[countKey]), 0), 'the bins lose no order').toBe(orders.length);

    // − Don't bin goes back to a group per amount.
    await page.locator('#selectNumericBin-total_amount').selectOption('none');
    await runVisualQuery(page);
    await expect(g4RowCount(page)).toContainText(`${queryLimit} rows returned`);

    // − a column that is not numeric offers no bins.
    await addGroupBy(page, 'channel');
    await expect(page.locator('#selectNumericBin-channel')).toHaveCount(0);
  });
});

test('(canvas mechanics) M49 Pick a table or a cube, and bind a cube to a dashboard filter', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M49 Pick and bind', async () => {
    const orders = frozenRows('orders');
    const products = frozenRows('products');
    const channels = new Set(orders.map((r) => r.channel)).size;

    await addFilterBarParam(page, `reportParameters {
  parameter(id: 'channel', type: 'String', label: 'Channel', defaultValue: 'web') {
    constraints(required: false)
    ui(control: 'text')
  }
}
`);
    const id = await eNewVisualWidget(page, 'orders');

    // + the picker moves the widget to another table; its own rows are counted.
    await pickVisualTable(page, 'products');
    await expect(page.locator('#btnPickTableOrCube'), 'the picker names the table').toContainText('products');
    await addAggregation(page, 0, 'COUNT', 'product_id');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, products.length, 'the products are counted');

    // + the picker moves the widget to a cube.
    await pickVisualCube(page, 'dd-sales');
    await expect(page.locator('#btnPickTableOrCube'), 'the picker names the cube').toContainText('(cube)');
    await applyCubeSelection(page, { dimensions: ['Channel'], measures: ['Revenue'] });
    await expect(g4RowCount(page), 'the cube answers a row per channel').toContainText(`${channels} rows returned`, { timeout: 30_000 });

    // + a bound member narrows the cube to the dashboard filter's value.
    await bindCubeMember(page, 0, { member: 'Channel', operator: 'equals', param: 'channel' });
    await expect(g4RowCount(page), 'only the web channel is left').toContainText('1 row returned', { timeout: 30_000 });

    // − removing the binding lets every channel back in.
    await page.locator('#btnRemoveCubeBind-0').click();
    await expect(page.locator('#selectCubeBindMember-0'), 'the binding row is gone').toHaveCount(0);
    await expect(g4RowCount(page)).toContainText(`${channels} rows returned`, { timeout: 30_000 });

    // − a table is not a cube: picking one again names the table.
    await pickVisualTable(page, 'orders');
    await expect(page.locator('#btnPickTableOrCube')).not.toContainText('(cube)');
    await expect(page.locator('#btnPickTableOrCube')).toContainText('orders');
  });
});

test('(canvas mechanics) M50 Number widget auto-summarize', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M50 Auto-summarize', async () => {
    const orders = frozenRows('orders');

    // + a Number widget on a table with nothing summarized asks for a metric; one click counts the rows.
    const id = await eNewVisualWidget(page, 'orders');
    await switchToWidget(page, 'number');
    await expect(page.locator('#btnAutoSummarize'), 'the widget asks for a metric').toBeVisible();
    await page.locator('#btnAutoSummarize').click();
    await expect(page.locator('#btnAutoSummarize'), 'the prompt is gone').toHaveCount(0);
    await g4ScalarIs(page, id, orders.length, 'the row count of the orders is shown');
    await expect(page.locator('#selectAggFunc-0'), 'the metric is now an aggregation of the query').toHaveValue('COUNT');

    // − a Number widget that already has an aggregation is not asked.
    const summed = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await switchToWidget(page, 'number');
    await g4ScalarIs(page, summed, orders.length, 'the chosen aggregation is shown');
    await expect(page.locator('#btnAutoSummarize')).toHaveCount(0);
  });
});

test('(canvas mechanics) M51 Chart stacked bars and bubble size', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M51 Stacked and bubble', async (canvasId) => {
    const orders = frozenRows('orders');

    // + a bar chart split by a second dimension can stack its bars; the choice is stored and drawn.
    const bars = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addGroupBy(page, 'status');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    await page.locator('#btnDisplayTab').click();
    await page.locator('#btnChartStacked-on').click();
    await expect.poll(async () => (await g4ChartStack(page, bars)).stacked, { timeout: 15_000 }).toBe(true);
    expect((await g4ChartStack(page, bars)).series, 'one series per status').toBeGreaterThan(1);
    let stored = await eStoredWidgets(page, canvasId,
      (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y?.stacked === true);
    expect(stored[0].displayConfig.dslConfig.options.scales.y.stacked).toBe(true);

    // − Off draws the bars side by side again and drops the option.
    await page.locator('#btnChartStacked-off').click();
    await expect.poll(async () => (await g4ChartStack(page, bars)).stacked, { timeout: 15_000 }).toBe(false);
    stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.scales === undefined);
    expect(stored[0].displayConfig.dslConfig.options?.scales).toBeUndefined();

    // − with no second dimension there is nothing to stack, and no choice is offered.
    await page.locator('#btnDataTab').click();
    await page.locator('#btnRemoveGroupBy-status').click();
    await runVisualQuery(page);
    await page.locator('#btnDisplayTab').click();
    await expect(page.locator('#btnChartStacked-on')).toHaveCount(0);
    await expect(page.locator('#btnChartStacked-off')).toHaveCount(0);

    // + a bubble chart takes its radius from the measure chosen as Size.
    //   The panel keeps the Display tab it was left on, so the Data tab is opened for the new widget.
    await page.locator('#btnDataTab').click();
    const bubbles = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'SUM', 'total_amount');
    await addAggregation(page, 1, 'SUM', 'tax_amount');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bubble');
    await page.locator('#btnDisplayTab').click();
    const sizes = await page.locator('#selectChartBubbleSize option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''),
    );
    const taxColumn = sizes.find((v) => v.toLowerCase().includes('tax'));
    expect(taxColumn, 'the tax sum is offered as a size').toBeDefined();
    await page.locator('#selectChartBubbleSize').selectOption(taxColumn!);
    const taxSums = g4SumBy(orders, 'channel', 'tax_amount');
    await expect
      .poll(async () => {
        const radii = await g4Radii(page, bubbles);
        return radii.length === taxSums.length && radii.every((r, i) => Math.abs(r - taxSums[i]) < 1);
      }, { message: 'each bubble is as big as its channel tax', timeout: 20_000, intervals: [500] })
      .toBe(true);
    stored = await eStoredWidgets(page, canvasId, (w) => w[1]?.displayConfig?.dslConfig?.bubbleSizeField === taxColumn);
    expect(stored[1].displayConfig.dslConfig.bubbleSizeField).toBe(taxColumn);

    // − Constant size gives every bubble the same radius and drops the field.
    await page.locator('#selectChartBubbleSize').selectOption('');
    await expect
      .poll(async () => new Set(await g4Radii(page, bubbles)).size, { message: 'every bubble has one radius', timeout: 20_000, intervals: [500] })
      .toBe(1);
    stored = await eStoredWidgets(page, canvasId, (w) => w[1]?.displayConfig?.dslConfig?.bubbleSizeField === undefined);
    expect(stored[1].displayConfig.dslConfig.bubbleSizeField).toBeUndefined();
  });
});

test('(canvas mechanics) M52 Sankey colour palette', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M52 Sankey palette', async (canvasId) => {
    const id = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addGroupBy(page, 'status');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'sankey');
    await setSankeyFields(page, { source: 'channel', target: 'status' });
    await expect.poll(() => g4SankeyColour(page, id), { timeout: 20_000 }).toBe('#509ee3');

    const pick = async (palette: string) => {
      await page.locator('#btnDisplayTab').click();
      await page.locator(`#btnSankeyPalette-${palette}`).click();
      await page.waitForTimeout(600);
      await page.locator('#btnDataTab').click();
      await page.waitForTimeout(300);
    };

    // + warm, cool and mono change the colours the flows are drawn in, and are stored.
    for (const [palette, colour] of [['warm', '#d62728'], ['cool', '#1f77b4'], ['mono', '#1a1a1a']] as const) {
      await pick(palette);
      await expect.poll(() => g4SankeyColour(page, id), { timeout: 15_000 }).toBe(colour);
      const stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.sankeyPalette === palette);
      expect(stored[0].displayConfig.sankeyPalette).toBe(palette);
    }

    // − Default restores the default colours.
    await pick('default');
    await expect.poll(() => g4SankeyColour(page, id), { timeout: 15_000 }).toBe('#509ee3');
    const stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.sankeyPalette === 'default');
    expect(stored[0].displayConfig.sankeyPalette).toBe('default');
  });
});

test('(canvas mechanics) M53 Auto pivot layout', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M53 Auto pivot layout', async (canvasId) => {
    const placed = (w: Array<Record<string, any>>) => {
      const d = w[0]?.displayConfig?.dslConfig ?? {};
      return (d.rows ?? []).length + (d.cols ?? []).length + (d.vals ?? []).length;
    };

    // − a new pivot lays itself out, so no prompt is shown.
    const id = await eNewVisualWidget(page, 'orders');
    await switchToWidget(page, 'pivot');
    await eStoredWidgets(page, canvasId, (w) => placed(w) > 0);
    await expect(page.locator(`[id="btnAutoPivotLayout-${id}"]`), 'a laid out pivot has no prompt').toHaveCount(0);

    // Empty every zone, as a person drags each field back to "Available fields".
    await page.locator('#btnDisplayTab').click();
    for (let i = 0; i < 12; i++) {
      const chip = page.locator('[id^="btnDragPivotField-"]').first();
      if ((await chip.count()) === 0) break;
      const field = ((await chip.getAttribute('id')) ?? '').replace('btnDragPivotField-', '');
      await cDragPivotField(page, field, 'available');
    }
    await eStoredWidgets(page, canvasId, (w) => placed(w) === 0);

    // + with nothing placed the pivot asks again, and one click lays it out.
    const button = page.locator(`[id="btnAutoPivotLayout-${id}"]`);
    await expect(button, 'an empty pivot asks for a layout').toBeVisible();
    await button.click();
    await expect(button, 'the prompt is gone').toHaveCount(0);
    await eStoredWidgets(page, canvasId, (w) => placed(w) > 0);
    await expect(page.locator(`[id="widgetViz-${id}"]`), 'the pivot draws again').toBeVisible();
  });
});

test('(canvas mechanics) M54 Published pivot: renderer, aggregator, value field and sort order', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId = '';
  try {
    await withFreshCanvas(page, 'E2E mech M54 Pivot reader', async (canvasId) => {
      const { reportId: published, pivot } = await g5PublishPivot(page, canvasId);
      reportId = published;
      const counts = g5Counts();
      let p = await cReadPivot(pivot) as CPivotState;
      g5ExpectCells(p, counts, 'as published, orders per status and channel');
      expect(p.state.rowOrder ?? 'key_a_to_z', 'the default order is by key').toBe('key_a_to_z');

      // + the renderer: Table → Table Row Heatmap (the name in the id is the name with its spaces made "_").
      await page.locator('[id$="btnPivotRenderer"]').click();
      const heatmap = g5Token('Table Row Heatmap');
      await page.locator(`[id$="btnPivotRenderer-${heatmap}"]`).click();
      p = await cWaitPivot(pivot, (x) => x.state.rendererName === 'Table Row Heatmap', 'the reader changed the renderer');
      // − a renderer only paints: the numbers do not move.
      g5ExpectCells(p, counts, 'after the renderer change');
      expect(cSame(p.rowKeys, g5Statuses)).toBe(true);

      // + the value field: Sum needs one. Choosing Sum alone has none yet…
      await page.locator('[id$="btnPivotAggregator"]').click();
      await page.locator(`[id$="btnPivotAggregator-${g5Token('Sum')}"]`).click();
      p = await cWaitPivot(pivot, (x) => x.state.aggregatorName === 'Sum', 'the reader changed the aggregator to Sum');
      // − …so it sums nothing: no cell carries the order totals.
      expect(p.state.vals, 'Sum has no value field until one is picked').toEqual([]);
      expect(Object.values(p.cells).some((v) => v > 0), 'and so nothing is summed').toBe(false);
      await expect(page.locator('[id$="btnPivotVal-0"]'), 'the picker shows it is empty').toContainText('(select)');

      // + picking total_amount sums it per cell: the seeded rows' sums.
      await page.locator('[id$="btnPivotVal-0"]').click();
      await page.locator(`[id$="btnPivotVal-0-${g5Token('total_amount')}"]`).click();
      p = await cWaitPivot(pivot, (x) => x.state.vals.join() === 'total_amount' && g5CellsMatch(x, g5Sums()), 'the reader picked total_amount and the server summed it');
      g5ExpectCells(p, g5Sums(), 'total_amount summed per status and channel');
      await expect(page.locator('[id$="btnPivotVal-0"]')).toContainText('total_amount');

      // + back to Count: the picker goes away (Count takes no field) and the counts are back.
      await page.locator('[id$="btnPivotAggregator"]').click();
      await page.locator(`[id$="btnPivotAggregator-${g5Token('Count')}"]`).click();
      p = await cWaitPivot(pivot, (x) => x.state.aggregatorName === 'Count' && g5CellsMatch(x, counts), 'Count again and the server counted');
      await expect(page.locator('[id$="btnPivotVal-0"]'), 'Count takes no value field').toHaveCount(0);
      g5ExpectCells(p, counts, 'counted again');

      // + the row sort cycles key → value ascending → value descending → key; the cells never change.
      const statusTotals = g5Totals('status');
      await page.locator('[id$="btnPivotRowOrder"]').click();
      p = await cWaitPivot(pivot, (x) => x.state.rowOrder === 'value_a_to_z', 'rows by value, ascending');
      expect(g5NonDecreasing(p.rowKeys, statusTotals), `rows ordered by their order count: ${p.rowKeys}`).toBe(true);
      await page.locator('[id$="btnPivotRowOrder"]').click();
      p = await cWaitPivot(pivot, (x) => x.state.rowOrder === 'value_z_to_a', 'rows by value, descending');
      expect(g5NonDecreasing(p.rowKeys, statusTotals, true), `rows ordered by their order count, descending: ${p.rowKeys}`).toBe(true);
      await page.locator('[id$="btnPivotRowOrder"]').click();
      p = await cWaitPivot(pivot, (x) => x.state.rowOrder === 'key_a_to_z', 'rows by key again');
      expect(p.rowKeys, 'back to A→Z').toEqual(g5Statuses);
      // − sorting the rows leaves the columns where they were, and the numbers alone.
      expect(p.colKeys).toEqual(g5Channels);
      g5ExpectCells(p, counts, 'after sorting the rows');

      // + the column sort is its own cycle.
      const channelTotals = g5Totals('channel');
      await page.locator('[id$="btnPivotColOrder"]').click();
      p = await cWaitPivot(pivot, (x) => x.state.colOrder === 'value_a_to_z', 'columns by value, ascending');
      expect(g5NonDecreasing(p.colKeys, channelTotals), `columns ordered by their order count: ${p.colKeys}`).toBe(true);
      await page.locator('[id$="btnPivotColOrder"]').click();
      p = await cWaitPivot(pivot, (x) => x.state.colOrder === 'value_z_to_a', 'columns by value, descending');
      expect(g5NonDecreasing(p.colKeys, channelTotals, true), `columns descending: ${p.colKeys}`).toBe(true);
      // − and the rows stayed A→Z while the columns moved.
      expect(p.rowKeys).toEqual(g5Statuses);
      g5ExpectCells(p, counts, 'after sorting the columns');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M55 Published pivot: filter a field\'s values', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId = '';
  try {
    await withFreshCanvas(page, 'E2E mech M55 Pivot filter', async (canvasId) => {
      const { reportId: published, pivot } = await g5PublishPivot(page, canvasId);
      reportId = published;
      const valueBtn = (v: string) => page.locator(`[id$="btnPivotFilterValue-status-${g5Token(v)}"]`);
      const onlyBtn = (v: string) => page.locator(`[id$="btnPivotFilterOnly-status-${g5Token(v)}"]`);
      const first = g5Statuses[0];

      // + the filter pops up for the field, listing every status.
      await expect(page.locator('[id$="dlgPivotFilter-status"]'), 'closed until asked').toHaveCount(0);
      await page.locator('[id$="btnPivotFilter-status"]').click();
      await expect(page.locator('[id$="dlgPivotFilter-status"]')).toBeVisible();
      for (const s of g5Statuses) await expect(valueBtn(s), `${s} is listed`).toBeVisible();

      // + unticking one value drops its row, and only its row.
      await valueBtn(first).click();
      let p = await cWaitPivot(pivot, (x) => !x.rowKeys.includes(first), `${first} left the pivot`);
      const rest = g5Statuses.filter((s) => s !== first);
      expect(p.rowKeys).toEqual(rest);
      // − the other rows keep their counts.
      g5ExpectCells(p, g5Counts(rest), `without ${first}`);
      await valueBtn(first).click();
      p = await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses), `${first} is back`);

      // + the search narrows the list to the values that contain the text.
      const term = first.toLowerCase();
      const matching = g5Statuses.filter((s) => s.toLowerCase().includes(term));
      expect(matching.length, 'the seeded statuses allow a search that keeps some and drops some').toBeLessThan(g5Statuses.length);
      await page.locator('[id$="txtPivotFilterSearch-status"]').fill(term);
      for (const s of g5Statuses) await expect(valueBtn(s), `${s} ${matching.includes(s) ? 'matches' : 'does not match'} "${term}"`).toHaveCount(matching.includes(s) ? 1 : 0);

      // + Deselect All takes out the listed (matching) values only.
      await page.locator('[id$="btnPivotFilterDeselectAll-status"]').click();
      const unmatched = g5Statuses.filter((s) => !matching.includes(s));
      p = await cWaitPivot(pivot, (x) => cSame(x.rowKeys, unmatched), 'the matching values are out');
      g5ExpectCells(p, g5Counts(unmatched), 'only the values that were not searched for remain');

      // + Select All brings every value back (it clears the whole filter; see FINDINGS).
      await page.locator('[id$="btnPivotFilterSelectAll-status"]').click();
      p = await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses), 'every status is back');
      g5ExpectCells(p, g5Counts(), 'all orders again');

      // + with the search cleared, Deselect All takes out everything: nothing is left to count.
      await page.locator('[id$="txtPivotFilterSearch-status"]').fill('');
      await page.locator('[id$="btnPivotFilterDeselectAll-status"]').click();
      p = await cWaitPivot(pivot, (x) => x.rowKeys.length === 0, 'with every status unticked no row is left');
      expect(Object.values(p.cells).reduce((a, b) => a + b, 0), 'and no order is counted').toBe(0);
      await page.locator('[id$="btnPivotFilterSelectAll-status"]').click();
      await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses), 'Select All restores them');

      // + "only" keeps exactly one value, the way the seeded rows count it.
      const only = g5Statuses[g5Statuses.length - 1];
      // the "only" link shows while the pointer is over its value, so the reader points at the value first
      await valueBtn(only).hover();
      await onlyBtn(only).click();
      p = await cWaitPivot(pivot, (x) => cSame(x.rowKeys, [only]), `only ${only} is left`);
      g5ExpectCells(p, g5Counts([only]), `${only} per channel`);
      // − "only" must not also toggle the value it sits on: the value stays ticked, the rest are unticked.
      await expect(valueBtn(only)).toHaveClass(/selected/);
      for (const s of g5Statuses.filter((v) => v !== only)) await expect(valueBtn(s), `${s} is unticked`).not.toHaveClass(/selected/);

      // + closing the box keeps the filter (closing is not resetting).
      await page.locator('[id$="btnClosePivotFilter-status"]').click();
      await expect(page.locator('[id$="dlgPivotFilter-status"]')).toHaveCount(0);
      p = await cReadPivot(pivot) as CPivotState;
      expect(p.rowKeys, 'the filter outlives the box').toEqual([only]);

      // + the filter's mark is on the field, and reopening shows the same ticks.
      await page.locator('[id$="btnPivotFilter-status"]').click();
      await expect(valueBtn(only)).toHaveClass(/selected/);
      await page.locator('[id$="btnPivotFilterSelectAll-status"]').click();
      await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses), 'Select All clears the filter');
      await page.locator('[id$="btnClosePivotFilter-status"]').click();
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M56 A slicer filters every widget built on its table', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M56 Slicer', async () => {
    // The widgets first, while there is no slicer yet: a KPI and a bar chart built in the Visual tab,
    // and two pasted-SQL tables - one whose result carries the slicers' own columns and one that
    // carries neither. Each answers for the whole table here, which is what the slicers then change.
    const kpi = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'number');
    await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');

    const chart = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'a bar per channel');
    expect(await pChartCounts(page, chart), 'the bars are the seeded orders per channel')
      .toEqual(pPerChannel());

    const sqlWithColumns = await fAddTabulator(page, 'dash_demo.orders',
      'SELECT channel, device, COUNT(*) AS n FROM dash_demo.orders GROUP BY channel, device');
    await pWaitRows(page, sqlWithColumns, (rows) => rows.length === pPairs.length,
      'the pasted query answers a row per channel and device');

    const sqlBlind = await fAddTabulator(page, 'dash_demo.orders',
      'SELECT COUNT(*) AS n FROM dash_demo.orders');
    await g4ScalarIs(page, sqlBlind, pOrders.length, 'the pasted count counts every order');

    // Two slicers on two fields of the same table. A slicer is added like any other element and reads
    // a table like any other widget.
    const channelSlicer = await addSlicer(page, 'orders', 'channel');
    const deviceSlicer = await addSlicer(page, 'orders', 'device');
    await expect(pValue(page, channelSlicer, 'web'), 'the slicer lists the values of its field').toBeVisible();

    // − a slicer with nothing picked is not a filter: every widget still answers for the whole table.
    await g4ScalarIs(page, kpi, pOrders.length, 'with nothing picked the KPI is unchanged');
    await g4ScalarIs(page, sqlBlind, pOrders.length, 'and so is the pasted count');
    await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'and every bar is still there');

    // + a value picked in the channel slicer filters every widget the slicer reaches - the Visual KPI,
    //   the Visual chart and the pasted query whose result has that column - to the seeded rows.
    await pClick(page, channelSlicer, 'web');
    const web = (r: Record<string, string>) => r.channel === 'web';
    await g4ScalarIs(page, kpi, pCount(web), 'the KPI counts the web orders');
    await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], ['web']), 'one bar is left');
    expect(await pChartCounts(page, chart), 'and it is as high as the web orders are many')
      .toEqual(pPerChannel(web));
    await pWaitRows(page, sqlWithColumns,
      (rows) => rows.length === pDevicesOf('web').length && rows.every((r) => String(r.channel) === 'web'),
      'the pasted query keeps its web rows only');

    // − the pasted query whose result has neither column is NOT filtered - a condition on a column
    //   that is not there would fail the whole query - and the widget says so itself.
    await g4ScalarIs(page, sqlBlind, pOrders.length, 'the count a slicer cannot reach still counts every order');
    await expect(pNotFiltered(page, sqlBlind), 'it names the fields that do not reach it')
      .toHaveText('not filtered by channel, device');
    for (const reached of [kpi, chart, sqlWithColumns]) {
      await expect(pNotFiltered(page, reached), 'a widget the slicers do reach says nothing').toHaveCount(0);
    }

    // + a second field ANDs with the first: one pair of values, one row, its own count.
    await pClick(page, deviceSlicer, 'mobile');
    const webMobile = (r: Record<string, string>) => r.channel === 'web' && r.device === 'mobile';
    await g4ScalarIs(page, kpi, pCount(webMobile), 'the KPI counts the web orders on a phone');
    await pWaitRows(page, sqlWithColumns,
      (rows) => rows.length === 1 && String(rows[0].channel) === 'web' && String(rows[0].device) === 'mobile'
        && Number(rows[0].n) === pCount(webMobile),
      'the pasted query is down to that one pair');

    // + Clear all drops every pick at once, and every widget answers for the whole table again.
    await page.locator('#btnClearSelections').click();
    await g4ScalarIs(page, kpi, pOrders.length, 'Clear all brings every order back');
    await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'and every bar');
    await pWaitRows(page, sqlWithColumns, (rows) => rows.length === pPairs.length, 'and every pair');
    await expect(page.locator('#btnClearSelections'), 'with nothing picked there is nothing to clear')
      .toHaveCount(0);

    // + the grey-outs: mobile_app orders only ever ship on a phone, so with mobile_app picked the
    //   other devices are the values that would answer no row at all, and the slicer dims them.
    await pClick(page, channelSlicer, 'mobile_app');
    for (const device of pDevicesOf('mobile_app')) {
      await expect(pValue(page, deviceSlicer, device), `a mobile_app order can ship on a ${device}`)
        .toHaveAttribute('data-state', 'associated', { timeout: 30_000 });
    }
    for (const device of pDevices.filter((d) => !pDevicesOf('mobile_app').includes(d))) {
      await expect(pValue(page, deviceSlicer, device), `no mobile_app order ships on a ${device}`)
        .toHaveAttribute('data-state', 'excluded', { timeout: 30_000 });
    }
    // − a pick does NOT dim the slicer it was made in: a slicer's values are a list, and a second pick
    //   is OR-ed into it, so every other value of that field stays live.
    await expect(pValue(page, channelSlicer, 'mobile_app'), 'the picked value shows as picked')
      .toHaveAttribute('data-state', 'selected');
    await expect(pValue(page, channelSlicer, 'web'), 'and its neighbour is still worth picking')
      .toHaveAttribute('data-state', 'associated');

    // + two values of one slicer are counted together, not against each other.
    await pClick(page, channelSlicer, 'web');
    await g4ScalarIs(page, kpi, pCount((r) => r.channel === 'mobile_app' || r.channel === 'web'),
      'the KPI counts the mobile_app orders and the web orders');
    await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], ['mobile_app', 'web']), 'two bars are left');
  });
});

test('(canvas mechanics) M57 The same slicers on the published dashboard, and a locked link only narrows', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  let readerContext: BrowserContext | undefined;

  try {
    await withFreshCanvas(page, 'E2E mech M57 Published slicer', async (canvasId) => {
      // The same dashboard as M56, with the two things a published page adds: a filter bar, so a
      // share link has something to lock, and a pasted query that uses it. The query's result
      // carries both slicer fields, so both slicers reach it - and the filter bar's own condition sits
      // on its own line, so "All channels" (the default) counts every order.
      await addFilterBarParam(page, B_CHANNEL_FILTER_DSL);

      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');

      const table = await fAddTabulator(page, 'dash_demo.orders',
        'SELECT channel, device, COUNT(*) AS n FROM dash_demo.orders\nWHERE channel = ${channel}\nGROUP BY channel, device');
      await pWaitRows(page, table, (rows) => rows.length === pPairs.length,
        'the pasted query answers a row per channel and device');

      const channelSlicer = await addSlicer(page, 'orders', 'channel');
      const deviceSlicer = await addSlicer(page, 'orders', 'device');
      await expect(pValue(page, channelSlicer, 'web'), 'the slicer lists the values of its field').toBeVisible();
      await expect(pValue(page, deviceSlicer, 'mobile'), 'and so does the second one').toBeVisible();

      // The names the published dashboard calls these widgets, which is how a reader's page is read.
      // A slicer is named after the field it filters by, and that name exists once the autosave has
      // landed the field: read a moment too early, a slicer answers under `slicer_<its id>` and
      // nothing on the published page is found by it.
      let ids: Record<string, string[]> = {};
      await expect
        .poll(async () => {
          ids = await getCanvasComponentIds(page, canvasId);
          return (ids['slicer'] ?? []).join(',');
        }, { message: 'the saved canvas names both slicers after their fields', timeout: 30_000, intervals: [1_000] })
        .toMatch(/^slicer_channel_[^,]+,slicer_device_[^,]+$/);
      const pubKpi = ids.number[0];
      const pubTable = ids.tabulator[0];
      const pubChannelSlicer = ids['slicer'][0];
      const pubDeviceSlicer = ids['slicer'][1];

      const published = await publishDashboard(page);
      reportId = published.reportId;

      // The share link is made while the author is still on the canvas: locked to one channel, so
      // the reader below meets a dashboard whose filter bar cannot be moved.
      await page.locator('#btnShareDashboard').click();
      await page.locator('#shareDialog').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#shareLockParam-channel').check();
      const lockValue = page.locator('#shareLockValue-channel');
      await lockValue.waitFor({ state: 'visible', timeout: 10_000 });
      await lockValue.locator('#channel').selectOption(B_CHANNEL);
      await page.locator('#btnCreateShareLink').click();
      await page.locator('#shareNewUrl').waitFor({ state: 'visible', timeout: 15_000 });
      const shareUrl = await page.locator('#shareNewUrl').inputValue();
      await page.locator('#btnShareClose').click();

      // ── The same clicks, on the published page ───────────────────────────
      await openPublished(page, reportId);
      await expect(pValue(page, pubChannelSlicer, 'web'), 'the published slicer lists its own values')
        .toBeVisible({ timeout: 60_000 });

      // − nothing picked is not a filter here either.
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'the published KPI counts every order');
      await pWaitCells(page, pubTable, (cells) => cells.length === pPairs.length,
        'and the published query answers a row per channel and device');
      await expect(page.locator('#selectionBar'), 'with nothing picked there is nothing to show')
        .toHaveCount(0);

      // + one value picked: the same numbers the canvas gave for the same click.
      await pClick(page, pubChannelSlicer, 'web');
      await pPublishedNumberIs(page, pubKpi, pCount((r) => r.channel === 'web'),
        'the published KPI counts the web orders');
      await pWaitCells(page, pubTable,
        (cells) => cells.length === pDevicesOf('web').length && cells.every((row) => row[0] === 'web'),
        'and the published query keeps its web rows only');
      await expect(page.locator('#selectionBar'), 'the chips bar says what is picked').toBeVisible();
      await expect(page.locator(`[id="btnRemoveSelection-channel-web"]`), 'one chip, for that one pick')
        .toBeVisible();

      // + a second field ANDs with the first, on the published page as on the canvas.
      await pClick(page, pubDeviceSlicer, 'mobile');
      const webMobile = (r: Record<string, string>) => r.channel === 'web' && r.device === 'mobile';
      await pPublishedNumberIs(page, pubKpi, pCount(webMobile), 'the KPI counts the web orders on a phone');
      await pWaitCells(page, pubTable,
        (cells) => cells.length === 1 && cells[0][0] === 'web' && cells[0][1] === 'mobile'
          && bDigits(cells[0][2]) === String(pCount(webMobile)),
        'and the query is down to that one pair');

      // + Clear all drops both picks, and the dashboard answers for everything again.
      await page.locator('#btnClearSelections').click();
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'Clear all brings every order back');
      await pWaitCells(page, pubTable, (cells) => cells.length === pPairs.length, 'and every pair');
      await expect(page.locator('#selectionBar'), 'and the chips bar goes with the picks')
        .toHaveCount(0);

      // + the grey-outs, which a published slicer reads off its own list (it may not ask
      //   /api/analytics/explore): a mobile_app order only ever ships on a phone, so with
      //   mobile_app picked the other devices are the values that would answer no row.
      await pClick(page, pubChannelSlicer, 'mobile_app');
      for (const device of pDevicesOf('mobile_app')) {
        await expect(pValue(page, pubDeviceSlicer, device), `a mobile_app order can ship on a ${device}`)
          .toHaveAttribute('data-state', 'associated', { timeout: 60_000 });
      }
      for (const device of pDevices.filter((d) => !pDevicesOf('mobile_app').includes(d))) {
        await expect(pValue(page, pubDeviceSlicer, device), `no mobile_app order ships on a ${device}`)
          .toHaveAttribute('data-state', 'excluded', { timeout: 60_000 });
      }
      // − and a slicer's own pick leaves its own list alone: its neighbour is still worth picking.
      await expect(pValue(page, pubChannelSlicer, 'web'), 'the other channels stay live')
        .toHaveAttribute('data-state', 'associated');

      // ── A share link with a locked filter-bar value: a pick only narrows ──
      readerContext = await page.context().browser()!.newContext();
      const reader = await readerContext.newPage();
      await reader.goto(shareUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(reader.locator('#publishedDashboard'), 'the link opens the dashboard with no sign-in')
        .toBeVisible({ timeout: 60_000 });
      await expect(reader.locator('#channel'), 'the locked control cannot be changed')
        .toBeDisabled({ timeout: 30_000 });

      // The lock is what the reader starts from: the one channel it fixed.
      const lockedRows = (cells: string[][]) =>
        cells.length > 0 && cells.every((row) => row[0] === B_CHANNEL);
      await pWaitCells(reader, pubTable, lockedRows, 'the locked link answers for its own channel only');

      // + a slicer pick of the locked value changes nothing: it narrows to what is already there.
      await pClick(reader, pubChannelSlicer, B_CHANNEL);
      await pWaitCells(reader, pubTable,
        (cells) => lockedRows(cells) && cells.length === pDevicesOf(B_CHANNEL).length,
        'picking the locked channel leaves the same rows');

      // − a slicer pick of ANOTHER value cannot widen past the lock: it narrows to nothing.
      await pClick(reader, pubChannelSlicer, B_CHANNEL);
      await pClick(reader, pubChannelSlicer, 'web');
      await pWaitCells(reader, pubTable, (cells) => cells.length === 0,
        'a slicer cannot reach rows the link locked away');
      await expect(reader.locator(`[id="btnRemoveSelection-channel-web"]`), 'the pick itself was taken')
        .toBeVisible();

      // + and a device pick narrows inside the lock, as a slicer should.
      await reader.locator('#btnClearSelections').click();
      await pClick(reader, pubDeviceSlicer, pDevicesOf(B_CHANNEL)[0]);
      await pWaitCells(reader, pubTable,
        (cells) => cells.length === 1 && cells[0][0] === B_CHANNEL
          && cells[0][1] === pDevicesOf(B_CHANNEL)[0],
        'the one pair the lock and the pick leave');
    });
  } finally {
    if (readerContext) await readerContext.close();
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M58 Clicks that filter the dashboard, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;

  try {
    await withFreshCanvas(page, 'E2E mech M58 Cross-filter', async (canvasId) => {
      // A KPI and a pasted-SQL table to be filtered, and the bar chart whose clicks will do the
      // filtering. The chart is built last, so it is the widget the Display tab configures - and
      // there is no slicer anywhere on this dashboard: a click is the only way to select here.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');

      const table = await fAddTabulator(page, 'dash_demo.orders',
        'SELECT channel, device, COUNT(*) AS n FROM dash_demo.orders GROUP BY channel, device');
      await pWaitRows(page, table, (rows) => rows.length === pPairs.length,
        'the pasted query answers a row per channel and device');

      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'a bar per channel');

      // - with the box unticked a click selects nothing and nothing moves, so no dashboard made
      //   before this existed starts filtering by itself: it opens the rows behind the bar (#21).
      await pClickBar(cViz(page, chart), 'web');
      await expect(page.locator('#widgetDrillModal'), 'an unticked chart opens the rows behind its bar')
        .toBeVisible();
      await expect(page.locator('#selectionBar'), 'an unticked chart selects nothing').toHaveCount(0);
      await g4ScalarIs(page, kpi, pOrders.length, 'and the KPI still counts every order');

      // + ticked, the rows still open over the bars are put away, and the same click selects the
      //   value its bar stands for, and every widget on the table answers for it - the chart itself
      //   excepted, because a widget is not filtered by the field its own clicks select. That is
      //   also what leaves a bar to click again.
      await setClicksFilter(page, 'chart', true);
      await expect(page.locator('#widgetDrillModal'), 'ticking the box closes the rows that were open')
        .toHaveCount(0);
      await pClickBar(cViz(page, chart), 'web');
      const web = (r: Record<string, string>) => r.channel === 'web';
      await g4ScalarIs(page, kpi, pCount(web), 'the KPI counts the web orders');
      await pWaitRows(page, table,
        (rows) => rows.length === pDevicesOf('web').length && rows.every((r) => String(r.channel) === 'web'),
        'the pasted query keeps its web rows only');
      await expect(page.locator('#selectionBar'), 'the chips bar shows a pick with no slicer on the page')
        .toBeVisible();
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'one chip, for that one click')
        .toBeVisible();
      await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels),
        'the chart that was clicked keeps every bar');

      // + a second click on the same bar takes the selection back, and the dashboard is as it was.
      await pClickBar(cViz(page, chart), 'web');
      await g4ScalarIs(page, kpi, pOrders.length, 'clicking again brings every order back');
      await pWaitRows(page, table, (rows) => rows.length === pPairs.length, 'and every pair');
      await expect(page.locator('#selectionBar'), 'and there is nothing left to show').toHaveCount(0);

      // -- the same two clicks, on the published page -----------------------
      // The names the published dashboard calls these widgets by, read once the autosave landed.
      let ids: Record<string, string[]> = {};
      await expect
        .poll(async () => {
          ids = await getCanvasComponentIds(page, canvasId);
          return (ids.number ?? []).length === 1 && (ids.tabulator ?? []).length === 1
            && (ids.chart ?? []).length === 1;
        }, { message: 'the saved canvas names all three widgets', timeout: 30_000, intervals: [1_000] })
        .toBe(true);
      const pubKpi = ids.number[0];
      const pubTable = ids.tabulator[0];
      const pubChart = ids.chart[0];

      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      // Looked up again on every click: each selection replaces the tiles with copies of themselves.
      const pubChartEl = () => page.locator(`[id="widgetChart-${pubChart}"]`);

      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'the published KPI counts every order');
      await pWaitCells(page, pubTable, (cells) => cells.length === pPairs.length,
        'and the published query answers a row per channel and device');
      await expect(page.locator('#selectionBar'), 'nothing is clicked yet').toHaveCount(0);

      // + the published chart was told to filter by its own config file, and nothing else: one
      //   click gives the same numbers the canvas gave for the same click.
      await pClickBar(pubChartEl(), 'web');
      await pPublishedNumberIs(page, pubKpi, pCount(web), 'the published KPI counts the web orders');
      await pWaitCells(page, pubTable,
        (cells) => cells.length === pDevicesOf('web').length && cells.every((row) => row[0] === 'web'),
        'and the published query keeps its web rows only');
      await expect(page.locator('#selectionBar'), 'the chips bar says what was clicked').toBeVisible();
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'one chip here too')
        .toBeVisible();

      // + and clicking the same bar again restores the published dashboard, as it does the canvas.
      await pClickBar(pubChartEl(), 'web');
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'a second click brings every order back');
      await pWaitCells(page, pubTable, (cells) => cells.length === pPairs.length, 'and every pair');
      await expect(page.locator('#selectionBar'), 'and the chips bar goes with the click')
        .toHaveCount(0);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/**
 * What a signed-out visitor gets for a share link: 200 while it opens the dashboard, 404 once the
 * link has been revoked or the dashboard taken down - `DashboardController.viewDashboard` answers
 * the same page for both, which is the point: a link that was taken back says nothing about what
 * it held. A context of its own, because the author's own session would answer 200 either way.
 */
async function shareLinkStatus(page: Page, shareUrl: string): Promise<number> {
  const probe = await page.context().browser()!.newContext();
  try {
    return (await probe.request.get(shareUrl)).status();
  } finally {
    await probe.close();
  }
}

/** A canvas with one KPI on it: the least a dashboard can be published from. */
async function oneKpiCanvas(page: Page, name: string): Promise<string> {
  await createFreshCanvas(page, CANVAS_LIST_URL, name);
  await selectConnectionByCode(page, DASH_DEMO_CONNECTION);
  const canvasId = canvasIdOf(page);
  const kpi = await eNewVisualWidget(page, 'orders');
  await addAggregation(page, 0, 'COUNT', 'order_id');
  await runVisualQuery(page);
  await switchToWidget(page, 'number');
  await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');
  return canvasId;
}

/** Make a plain share link for the dashboard the toolbar is showing, and hand back its URL. */
async function createPlainShareLink(page: Page): Promise<string> {
  await page.locator('#btnShareDashboard').click();
  await page.locator('#shareDialog').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#btnCreateShareLink').click();
  await page.locator('#shareNewUrl').waitFor({ state: 'visible', timeout: 15_000 });
  const url = await page.locator('#shareNewUrl').inputValue();
  await page.locator('#btnShareClose').click();
  return url;
}

test('(canvas mechanics) M59 Deleting a canvas says what goes with it, and Unpublish takes a dashboard back', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let keptReportId: string | undefined;

  try {
    // ── Keep the published dashboard ──────────────────────────────────────
    // A canvas, published, with one share link open on it.
    const keepCanvas = await oneKpiCanvas(page, 'E2E mech M59 Keep published');
    const kept = await publishDashboard(page);
    keptReportId = kept.reportId;
    const keptLink = await createPlainShareLink(page);
    expect(await shareLinkStatus(page, keptLink), 'the link opens the dashboard it was made for')
      .toBe(200);

    // The dialog says what goes with the canvas - it used to delete the dashboard in silence -
    // and the checkbox is what the sentence changes with.
    await page.goto(CANVAS_LIST_URL);
    await page.waitForLoadState('networkidle');
    await page.locator(`[id="btnDeleteCanvas-${keepCanvas}"]`).click({ force: true });
    const said = page.locator('#txtDeleteCanvasPublished');
    await expect(said, 'the dialog names the dashboard and the link').toContainText(
      `/dashboard/${keptReportId}`);
    await expect(said, 'and says they go too').toContainText('its 1 share link are deleted too');
    await page.locator('#chkKeepPublished').check();
    await expect(said, 'ticked, the same sentence says they stay')
      .toContainText('its 1 share link keep answering');
    await page.locator('#btnConfirmDeleteCanvas').click();
    await page.waitForTimeout(1_500);

    await expect(page.locator(`[id="canvasCard-${keepCanvas}"]`), 'the canvas is gone')
      .toHaveCount(0);
    expect(await shareLinkStatus(page, keptLink), 'and the link it published still answers')
      .toBe(200);

    // ── Unpublish, then delete with everything ────────────────────────────
    const canvas = await oneKpiCanvas(page, 'E2E mech M59 Unpublish');
    const first = await publishDashboard(page);
    const firstLink = await createPlainShareLink(page);
    expect(await shareLinkStatus(page, firstLink), 'that link answers too').toBe(200);

    // Unpublish names the same facts, and takes the dashboard and its links away.
    await page.locator('#btnUnpublishDashboard').click();
    await expect(page.locator('#txtUnpublishConsequences'), 'it says what stops answering')
      .toContainText(`/dashboard/${first.reportId}`);
    await expect(page.locator('#txtUnpublishConsequences'), 'the link among it')
      .toContainText('its 1 share link stop answering');
    await page.locator('#btnConfirmUnpublish').click();
    await expect(page.locator('#btnUnpublishDashboard'), 'there is nothing left to unpublish')
      .toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#btnShareDashboard'), 'nor anything to share').toHaveCount(0);
    await expect(page.locator('#btnPublishDashboard'), 'and the canvas can be published again')
      .toBeEnabled();
    expect(await shareLinkStatus(page, firstLink), 'the link of the dashboard that went is gone')
      .toBe(404);

    // Published again, the canvas has a dashboard and a link of its own once more.
    const second = await publishDashboard(page);
    const secondLink = await createPlainShareLink(page);
    expect(await shareLinkStatus(page, secondLink), 'the new link answers').toBe(200);

    // Deleted with the checkbox left alone, everything goes: the plain way round.
    await deleteCanvasViaUI(page, canvas);
    await expect(page.locator(`[id="canvasCard-${canvas}"]`), 'the canvas is gone').toHaveCount(0);
    expect(await shareLinkStatus(page, secondLink), 'and so is the link of its dashboard')
      .toBe(404);
    expect(second.reportId, 'the same canvas name publishes under the same code')
      .toBe(first.reportId);
  } finally {
    // The dashboard the first canvas left behind on purpose is the test's to take back.
    if (keptReportId) await deleteReportAsAdmin(keptReportId);
  }
});

test('(canvas mechanics) M60 Going back to Visual asks before it drops a hand-written query', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M60 SQL edits', async () => {
    // A visual query: orders per channel.
    await addTableToCanvas(page, 'dash_demo.orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await expect(dRowCount(page), 'the visual query has a row per channel')
      .toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });
    const sqlEditor = page.locator('#sqlEditorInput');

    // − Nothing edited: the SQL tab shows the query the Visual tab wrote, and going back asks
    //   nothing - there is nothing to lose.
    await eOpenFinetune(page, 'sql');
    await expect(sqlEditor, "the Visual tab's own query is what the SQL tab opens on")
      .toContainText('channel', { timeout: 15_000 });
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#dlgSqlEditsLost'), 'nothing was edited, so nothing is asked')
      .toHaveCount(0);
    await expect(page.locator('#btnAddAggregation'), 'and the Visual tab is what we are on')
      .toBeVisible();

    // + Written by hand: the question comes, and Keep SQL leaves the query, and the tab, alone.
    await runSqlQuery(page, 'SELECT order_id FROM dash_demo.orders LIMIT 3');
    await expect(dRowCount(page), 'the hand-written query answers')
      .toContainText('3 rows returned', { timeout: 30_000 });
    await page.locator('#btnQueryTab-visual').click();
    await expect(page.locator('#dlgSqlEditsLost'), 'this time the Canvas asks').toBeVisible();
    await expect(page.locator('#txtSqlEditsLost'), 'and says what going back would cost')
      .toContainText('wrote by hand');
    await page.locator('#btnKeepSql').click();
    await expect(page.locator('#dlgSqlEditsLost'), 'the question is answered').toHaveCount(0);
    await expect(sqlEditor, 'the hand-written query is still here').toContainText('LIMIT 3');
    await expect(page.locator('#btnRunSqlQuery'), 'on the tab it was written on').toBeVisible();
    await expect(dRowCount(page), 'answering the widget as it did')
      .toContainText('3 rows returned');

    // + Switch: the Visual tab takes the query back, and its own query answers again.
    await page.locator('#btnQueryTab-visual').click();
    await page.locator('#btnSwitchToVisual').click();
    await expect(page.locator('#btnAddAggregation'), 'the Visual tab is on screen').toBeVisible();
    await expect(dRowCount(page), 'the visual query answers again')
      .toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });

    // − What the question warned about: the hand-written query is gone, and the SQL tab shows the
    //   Visual tab's query again - so going back a second time asks nothing.
    await page.locator('#btnQueryTab-finetune').click();
    await expect(sqlEditor, "the Visual tab's query is back in the editor")
      .toContainText('channel', { timeout: 15_000 });
    const left = await sqlEditor.innerText();
    expect(left, 'and the hand-written one went with the Switch').not.toMatch(/SELECT\s+order_id\s+FROM/i);
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#dlgSqlEditsLost'), 'nothing is edited any more, so nothing is asked')
      .toHaveCount(0);
  });
});

test('(canvas mechanics) M61 What the author puts before and after a number, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M61 Prefix and suffix', async () => {
    const orders = pOrders.length.toLocaleString('en-US');

    // Two KPIs counting the same orders, so only what is around the number differs: a currency
    // sign no format writes, and a unit after the number.
    const money = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'number');
    await g4ScalarIs(page, money, pOrders.length, 'the KPI counts every order');
    await clickDisplayTab(page);
    await page.locator('#selectNumberFormat').selectOption('number');
    await page.locator('#inputNumberPrefix').fill('€ ');
    await expect(page.locator(`#widgetViz-${money}`), 'the Canvas puts the sign before the number')
      .toHaveText(`€ ${orders}`, { timeout: 15_000 });
    // + Compact (#27): the sign stays where it is, the number reads short.
    const short = pOrders.length.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    await page.locator('#selectNumberFormat').selectOption('compact');
    await expect(page.locator(`#widgetViz-${money}`), 'the Canvas writes it short')
      .toHaveText(`€ ${short}`, { timeout: 15_000 });

    await clickDataTab(page);
    const unit = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'number');
    await clickDisplayTab(page);
    await page.locator('#selectNumberFormat').selectOption('number');
    await page.locator('#inputNumberSuffix').fill(' %');
    await expect(page.locator(`#widgetViz-${unit}`), 'and the unit after it')
      .toHaveText(`${orders} %`, { timeout: 15_000 });

    // − Taken out again, the number is on its own: the box is what puts them there, nothing else.
    await page.locator('#inputNumberSuffix').fill('');
    await expect(page.locator(`#widgetViz-${unit}`), 'an empty box adds nothing')
      .toHaveText(orders, { timeout: 15_000 });
    await page.locator('#inputNumberSuffix').fill(' %');
    await expect(page.locator(`#widgetViz-${unit}`)).toHaveText(`${orders} %`, { timeout: 15_000 });

    // + Published, the two tiles read the same as they do in the Canvas.
    const published = await publishDashboard(page);
    const dashboard = await openPublished(page, published.reportId);
    await expect
      .poll(async () => (await dashboard.locator('[id^="widgetValue-"]').allInnerTexts()).map((s) => s.trim()).sort(),
            { message: 'the published numbers carry the sign and the unit', timeout: 60_000, intervals: [1_000] })
      .toEqual([`€ ${short}`, `${orders} %`].sort());
  });
});

/** The first dataset's colours of a widget's chart, as Chart.js holds them. */
async function pChartColors(page: Page, widgetId: string): Promise<string[]> {
  return page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (document.getElementById(`widgetViz-${id}`) as any)?.getChartInstance?.();
    const bg = chart?.data?.datasets?.[0]?.backgroundColor;
    return Array.isArray(bg) ? bg.map(String) : [String(bg ?? '')];
  }, widgetId);
}

/** The same, for every chart on a published page (each one's box `widgetChart-<cid>`), with the type each one is drawn as. */
async function pPublishedChartColors(page: Page): Promise<Array<{ type: string; colors: string[] }>> {
  return page.locator('#publishedDashboard [id^="widgetChart-"]').evaluateAll((boxes) =>
    boxes.map((box) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chart = ((box.getRootNode() as ShadowRoot).host as any)?.getChartInstance?.();
      const bg = chart?.data?.datasets?.[0]?.backgroundColor;
      return {
        type: String(chart?.config?.type ?? ''),
        colors: Array.isArray(bg) ? bg.map(String) : [String(bg ?? '')],
      };
    }));
}

test('(canvas mechanics) M62 The colours an author picks for a chart, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M62 Chart palette', async () => {
    const warm = ['#d62728', '#ff7f0e', '#ffbb78', '#8c564b', '#e377c2', '#f7b6d2', '#bcbd22', '#dbdb8d'];

    // Orders per channel twice: as bars, where the colour is the series', and as a pie, where it is
    // each slice's. Both drawn in the set the author picks, which is neither the Canvas's house
    // colours nor the published page's.
    const bars = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    const houseColours = await pChartColors(page, bars);
    expect(houseColours[0], 'the bars start in the house colours').not.toBe(warm[0]);

    await clickDisplayTab(page);
    await page.locator('#btnChartPalette-warm').click();
    await expect
      .poll(async () => (await pChartColors(page, bars))[0],
            { message: 'the bars take the colour the author picked', timeout: 20_000, intervals: [500] })
      .toBe(warm[0]);

    await clickDataTab(page);
    const pie = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'pie');
    await clickDisplayTab(page);
    await page.locator('#btnChartPalette-warm').click();
    const wantSlices = Array.from({ length: D_ORDER_CHANNELS }, (_, i) => warm[i % warm.length]);
    await expect
      .poll(async () => await pChartColors(page, pie),
            { message: 'a slice of the set at a time', timeout: 20_000, intervals: [500] })
      .toEqual(wantSlices);
    const canvasSlices = await pChartColors(page, pie);

    // + Published, the same two charts are drawn in the same colours.
    const published = await publishDashboard(page);
    await openPublished(page, published.reportId);
    await expect
      .poll(async () => {
        const charts = await pPublishedChartColors(page);
        if (charts.length < 2) return null;
        return {
          bar: charts.find((c) => c.type === 'bar')?.colors[0] ?? '',
          pie: charts.find((c) => c.type === 'pie')?.colors ?? [],
        };
      }, { message: 'the published charts keep the author\'s colours', timeout: 60_000, intervals: [1_000] })
      .toEqual({ bar: warm[0], pie: canvasSlices });
  });
});

test('(canvas mechanics) M63 A widget whose query fails says so, and a wait for its data stops on the error', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M63 Widget errors', async (canvasId) => {
    await addTableToCanvas(page, 'dash_demo.orders');
    const id = await getLastWidgetId(page);
    const works = "SELECT 'web' AS channel, 'Web' AS label, 3 AS orders, 5 AS target "
      + "UNION ALL SELECT 'store', 'Store', 4, 6";
    const fails = 'SELECT no_such_column FROM dash_demo.orders';

    // Every kind of widget: drawn first from a query that works, then given one that does not.
    for (const type of ['chart', 'number', 'tabulator', 'pivot', 'trend', 'map', 'sankey', 'gauge', 'progress', 'detail'] as const) {
      await runSqlQuery(page, works);
      await switchToWidget(page, type);
      await expect
        .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.type, { message: `the widget is a ${type}`, timeout: 20_000 })
        .toBe(type);
      await runSqlQuery(page, fails);

      // The widget shows the database's own words, under its own id.
      await expect(page.locator(`[id="widgetError-${id}"]`), `the ${type} says its query failed`)
        .toContainText('no_such_column', { timeout: 30_000 });

      // + And a test waiting for its data stops at once, with that message, instead of timing out.
      const waited = await waitForWidgetData(page, id, 30_000).then(() => 'drawn', (e: Error) => e.message);
      expect(waited, `waiting on the ${type} stops on its error`).toContain('no_such_column');
    }

    // − A query that works again takes the error away.
    await runSqlQuery(page, works);
    await expect(page.locator(`[id="widgetError-${id}"]`), 'the error goes with the query').toHaveCount(0, { timeout: 30_000 });
  });
});

/**
 * The series a chart draws, as Chart.js holds them: the first one's name, how each is drawn, the
 * axis each is on (`y` the left, `y1` the right), and where the right axis stands, if there is one.
 * `chart` is the chart's element or its box inside it (`widgetChart-<cid>`, in its shadow root).
 */
async function m64Series(chart: Locator): Promise<{ first: string; types: string[]; axes: string[]; right: string | null }> {
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawn = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = drawn?.data?.datasets ?? [];
    return {
      first: String(datasets[0]?.label ?? ''),
      types: datasets.map((d) => String(d.type ?? '')),
      axes: datasets.map((d) => String(d.yAxisID ?? 'y')),
      right: (drawn?.options?.scales?.y1?.position as string | undefined) ?? null,
    };
  });
}

test('(canvas mechanics) M64 A combo chart names its series, draws each as bars or a line, and puts one on a right axis', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M64 Combo series', async (canvasId) => {
    // Sales and orders per channel: two measures of very different sizes, what a right axis is for.
    const combo = await eNewVisualWidget(page, 'orders');
    await addGroupBy(page, 'channel');
    await addAggregation(page, 0, 'SUM', 'total_amount');
    await addAggregation(page, 1, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'combo');
    await clickDisplayTab(page);
    // The chart starts on the first measure; the orders count is added as the second.
    await expect(page.locator('#selectChartYAxis-0')).toHaveValue(/total_amount/);
    await page.locator('#btnAddChartYAxis').click();
    await expect(page.locator('#selectChartYAxis-1')).toHaveValue(/order_id/);
    const inCanvas = page.locator(`[id="widgetViz-${combo}"]`);

    // Nothing set yet: the first measure as bars, the second as a line, both on the left axis.
    await expect(page.locator('#selectChartSeriesType-0')).toHaveValue('bar');
    await expect(page.locator('#selectChartSeriesType-1')).toHaveValue('line');
    await expect(page.locator('#chkChartSeriesRightAxis-1')).not.toBeChecked();
    await expect
      .poll(async () => m64Series(inCanvas), { timeout: 20_000, intervals: [500] })
      .toMatchObject({ types: ['bar', 'line'], axes: ['y', 'y'], right: null });

    // + The author names the first series, draws it as a line and the second as bars, and puts the
    //   second on the right axis: the chart draws exactly that, and the canvas keeps it.
    await page.locator('#inputChartSeriesLabel-0').fill('Sales');
    await page.locator('#selectChartSeriesType-0').selectOption('line');
    await page.locator('#selectChartSeriesType-1').selectOption('bar');
    await page.locator('#chkChartSeriesRightAxis-1').check();
    const set = { first: 'Sales', types: ['line', 'bar'], axes: ['y', 'y1'], right: 'right' };
    await expect
      .poll(async () => m64Series(inCanvas), { message: 'the Canvas draws the series as set', timeout: 20_000, intervals: [500] })
      .toEqual(set);
    let stored = await eStoredWidgets(page, canvasId,
      (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y1?.position === 'right');
    let datasets = stored[0].displayConfig.dslConfig.data.datasets;
    expect(datasets[0]).toMatchObject({ label: 'Sales', type: 'line' });
    expect(datasets[0].yAxisID).toBeUndefined();
    expect(datasets[1]).toMatchObject({ type: 'bar', yAxisID: 'y1' });

    // − Back on the left axis, the right axis goes with its last series, from the chart and the canvas.
    await page.locator('#chkChartSeriesRightAxis-1').uncheck();
    await expect
      .poll(async () => m64Series(inCanvas), { timeout: 20_000, intervals: [500] })
      .toMatchObject({ axes: ['y', 'y'], right: null });
    stored = await eStoredWidgets(page, canvasId,
      (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y1 === undefined);
    datasets = stored[0].displayConfig.dslConfig.data.datasets;
    expect(datasets[1].yAxisID).toBeUndefined();
    await page.locator('#chkChartSeriesRightAxis-1').check();
    await expect
      .poll(async () => m64Series(inCanvas), { timeout: 20_000, intervals: [500] })
      .toEqual(set);

    // + Published, the chart draws the same series the same way.
    const published = await publishDashboard(page);
    const dashboard = await openPublished(page, published.reportId);
    await expect
      .poll(async () => m64Series(dashboard.locator('[id^="widgetChart-"]')),
            { message: 'the published chart draws the series as set', timeout: 60_000, intervals: [1_000] })
      .toEqual(set);
  });
});

/** The parameters the server holds for a canvas, by id. */
async function m65Params(page: Page, canvasId: string): Promise<Record<string, any>> {
  const state = stateOf(await readCanvas(page, canvasId));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.fromEntries(((state.parametersConfig?.parameters ?? []) as any[]).map((p) => [p.id, p]));
}

/** What the four filters of M65 hold once the author is done, as a shipped file would say them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function m65Expect(params: Record<string, any>): void {
  expect(Object.keys(params).sort()).toEqual(['active_only', 'channels', 'shipCountry', 'top_n']);
  expect(params.shipCountry).toMatchObject({
    label: 'Shipping Country',
    defaultValue: 'DE',
    constraints: { required: false },
    uiHints: { control: 'select', options: [{ value: 'DE', label: 'Germany' }, { value: 'FR', label: 'France' }] },
  });
  expect(params.shipCountry.uiHints.widget, 'one word for the control: `control`').toBeUndefined();
  expect(params.channels.uiHints.control).toBe('multiselect');
  expect(params.channels.defaultValue, 'a multi-select with nothing picked starts with []').toEqual([]);
  expect(params.top_n).toMatchObject({ type: 'Integer', defaultValue: 10, constraints: { allowedValues: [5, 10, 20] } });
  expect(params.active_only).toMatchObject({ type: 'Boolean', defaultValue: false });
}

test('(canvas mechanics) M65 The filter form names a filter, and writes its values as the shipped files do', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M65 Filter form', async (canvasId) => {
    await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);

    await page.locator('#btnConfigureFilters').click();
    await page.locator('#btnAddParameter').waitFor({ state: 'visible', timeout: 5_000 });

    // A select over two countries. The id follows the label until the author types one; from then on
    // a new label leaves it be. A select's options can show a name for each value (`DE=Germany`).
    await page.locator('#btnAddParameter').click();
    await page.locator('#inputParamLabel-param1').fill('Ship Country');
    await expect(page.locator('#inputParamId-ship_country'), 'the id follows the label').toHaveValue('ship_country');
    await page.locator('#inputParamId-ship_country').fill('ship-Country!');
    await expect(page.locator('#inputParamId-shipCountry'), 'only letters, digits and _ are kept').toHaveValue('shipCountry');
    await page.locator('#inputParamLabel-shipCountry').fill('Shipping Country');
    await expect(page.locator('#inputParamId-shipCountry'), 'a typed id stays when the label changes').toHaveValue('shipCountry');
    await page.locator('#selectParamWidget-shipCountry').selectOption('select');
    await page.locator('#inputParamOptions-shipCountry').fill('DE=Germany, FR=France');
    await page.locator('#inputParamDefault-shipCountry').fill('DE');
    await page.locator('#inputParamRequired-shipCountry').check();
    await page.locator('#inputParamRequired-shipCountry').uncheck();

    // A multi-select: its default is a list. One typed value becomes a list of one, the control kept
    // across, and an emptied box is `[]`.
    await page.locator('#btnAddParameter').click();
    await page.locator('#inputParamLabel-param2').fill('Channels');
    await page.locator('#inputParamDefault-channels').fill('web');
    await page.locator('#selectParamWidget-channels').selectOption('multiselect');
    await expect.poll(async () => (await m65Params(page, canvasId)).channels?.defaultValue,
      { message: 'a value becomes a list of one', timeout: 20_000, intervals: [500] }).toEqual(['web']);
    await page.locator('#inputParamDefault-channels').fill('');

    // An Integer: its default and the values it accepts are numbers, not text.
    await page.locator('#btnAddParameter').click();
    await page.locator('#inputParamLabel-param3').fill('Top N');
    await page.locator('#selectParamType-top_n').selectOption('Integer');
    await page.locator('#inputParamDefault-top_n').fill('10');
    await page.locator('#inputParamAllowedValues-top_n').fill('5, 10, 20');

    // A Boolean: `false` is a default to pick, not an empty box.
    await page.locator('#btnAddParameter').click();
    await page.locator('#inputParamLabel-param4').fill('Active only');
    await page.locator('#selectParamType-active_only').selectOption('Boolean');
    await page.locator('#selectParamDefault-active_only').selectOption('false');

    await page.locator('#btnDoneFilters').click();
    await page.locator('#formReportParameters').waitFor({ state: 'visible', timeout: 10_000 });
    await expect.poll(async () => (await m65Params(page, canvasId)).active_only?.defaultValue,
      { timeout: 20_000, intervals: [500] }).toBe(false);
    m65Expect(await m65Params(page, canvasId));

    // The DSL view says the same, in the shipped files' words; saved back from it, nothing changes.
    await page.locator('#btnConfigureFilters').click();
    await page.locator('#btnFilterDslToggle').click();
    const dsl = page.locator('#filterDslEditorInput');
    await expect(dsl).toContainText('shipCountry', { timeout: 15_000 });
    await expect(dsl).toContainText('select');
    await expect(dsl).not.toContainText('widget');
    await page.locator('#btnDoneFilters').click();
    await page.locator('#formReportParameters').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(2_000);
    m65Expect(await m65Params(page, canvasId));

    // + Published, the filter bar offers the countries by name with Germany picked, 10 in Top N,
    //   and Active only unticked.
    const published = await publishDashboard(page);
    const dashboard = await openPublished(page, published.reportId);
    const country = dashboard.locator('[id="shipCountry"]');
    await expect(country).toBeVisible({ timeout: 60_000 });
    await expect(country.locator('option')).toHaveText(['Germany', 'France']);
    await expect(country).toHaveValue('DE');
    await expect(dashboard.locator('[id="top_n"]')).toHaveValue('10');
    await expect(dashboard.locator('[id="active_only"]')).not.toBeChecked();
    await page.goBack();
    await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });

    // A shipped file's own words for a control (`multi-select`) are read as the form's choice.
    await addFilterBarParam(page, `reportParameters {
  parameter(id: 'regions', type: String, label: 'Regions', defaultValue: []) {
    ui(control: 'multi-select', options: ['North', 'South'])
  }
}
`);
    await page.locator('#btnConfigureFilters').click();
    await expect(page.locator('#selectParamWidget-regions'), 'a shipped multi-select is the multiselect choice')
      .toHaveValue('multiselect', { timeout: 10_000 });
    await expect(page.locator('#inputParamOptions-regions')).toHaveValue('North, South');
    await page.locator('#btnDoneFilters').click();
    await expect.poll(async () => (await m65Params(page, canvasId)).regions?.uiHints?.control,
      { message: 'opening the form leaves the file as written', timeout: 20_000, intervals: [500] }).toBe('multi-select');
  });
});

test('(canvas mechanics) M66 A relative date filter counts from the data\'s today, as a filter default does', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M66 Data today', async (canvasId) => {
    // The demo data's today is the day it was seeded to, 2026-09-30 here (`dash_demo.as_of`), the
    // same day a `{dataToday}` filter default is read against. The machine's own day is later: counted
    // from it, "the last 7 days" of this data would hold no order at all.
    const day = (r: Record<string, string>): string => r.order_ts.slice(0, 10);
    const lastWeek = pCount((r) => day(r) >= '2026-09-24' && day(r) <= '2026-09-30');
    const september = pCount((r) => day(r) >= '2026-09-01' && day(r) <= '2026-09-30');
    expect(lastWeek, 'the seeded data has orders in its own last week').toBeGreaterThan(0);

    const kpi = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'order_ts', 'last_n_days', '7');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'number');
    await g4ScalarIs(page, kpi, lastWeek, 'the last 7 days end on the data\'s today');

    // + a period: this month is the data's month.
    await page.locator('#selectFilterOp-0').selectOption('this_month');
    await runVisualQuery(page);
    await g4ScalarIs(page, kpi, september, 'this month is the data\'s month');

    // + published, the same day: the SQL written for the page counts from it too.
    let ids: Record<string, string[]> = {};
    await expect.poll(async () => {
      ids = await getCanvasComponentIds(page, canvasId);
      return (ids.number ?? []).length;
    }, { message: 'the saved canvas holds the number widget', timeout: 30_000, intervals: [1_000] }).toBe(1);
    const published = await publishDashboard(page);
    await openPublished(page, published.reportId);
    await pPublishedNumberIs(page, ids.number[0], september, 'published, this month is still the data\'s month');
  });
});

test('(canvas mechanics) M67 Need another table? A cube carries the joins and the business measures', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M67 Cube as the join layer', async () => {
    // The truths, from the frozen rows: a delivered order is late when it arrived after its promised
    // day, and a return rate is the returned orders over every order placed (the cube's own words).
    const orders = frozenRows('orders');
    const segmentOf = new Map(frozenRows('customers').map((c) => [c.customer_id, c.segment]));
    const carriers = [...new Set(orders.map((o) => o.carrier))];
    const segments = [...new Set(orders.map((o) => segmentOf.get(o.customer_id) ?? ''))];

    // + a widget on one table says where another table comes from, and the line opens the picker.
    const id = await eNewVisualWidget(page, 'orders');
    await expect(page.locator('#hintUseCube'), 'the Visual tab names the cube as the join layer').toContainText('Need another table?');
    await page.locator('#btnHintUseCube').click();
    await page.locator('[id="itemPickCube-dd-delivery"]').click();
    await expect(page.locator('#btnPickTableOrCube'), 'the widget now reads the cube').toContainText('(cube)');
    // − on a cube the line is gone: the cube is already the answer.
    await expect(page.locator('#hintUseCube')).toHaveCount(0);

    // + On-Time % per carrier: a measure made of two others, answered as the frozen rows answer it.
    await applyCubeSelection(page, { dimensions: ['Carrier'], measures: ['Delivered', 'Late', 'OnTimePct'] });
    // A dimension and measures make the widget a chart by itself; the rows are read off a table.
    await switchToWidget(page, 'tabulator');
    const byCarrier = await g4RowsWhere(page, id,
      (rows) => rows.length === carriers.length && rows.every((r) => 'OnTimePct' in r), 'one row per carrier');
    for (const carrier of carriers) {
      const mine = orders.filter((o) => o.carrier === carrier && o.delivered_ts !== '');
      const late = mine.filter((o) => o.delivered_ts.slice(0, 10) > o.promised_date).length;
      const row = byCarrier.find((r) => Object.values(r).includes(carrier));
      expect(row, `a row for ${carrier}`).toBeTruthy();
      expect(Number(row!.Delivered), `${carrier} delivered`).toBe(mine.length);
      expect(Number(row!.Late), `${carrier} late`).toBe(late);
      expect(Math.abs(Number(row!.OnTimePct) - (mine.length - late) / mine.length), `${carrier} on time`).toBeLessThan(1e-6);
    }

    // + Return Rate by the customer's segment: the cube joins the customers, the Visual tab never does.
    await applyCubeSelection(page, { dimensions: ['Segment'], measures: ['ReturnRatePct'] });
    await switchToWidget(page, 'tabulator');
    const bySegment = await g4RowsWhere(page, id,
      (rows) => rows.length === segments.length && rows.every((r) => 'ReturnRatePct' in r), 'one row per segment');
    for (const segment of segments) {
      const mine = orders.filter((o) => segmentOf.get(o.customer_id) === segment);
      const returned = mine.filter((o) => o.status === 'returned').length;
      const row = bySegment.find((r) => Object.values(r).includes(segment));
      expect(row, `a row for ${segment}`).toBeTruthy();
      expect(Math.abs(Number(row!.ReturnRatePct) - returned / mine.length), `${segment} return rate`).toBeLessThan(1e-6);
    }
  });
});

test('(canvas mechanics) M68 Count where and Sum where sit beside the plain aggregate in one grouped query', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M68 Count where', async () => {
    const orders = frozenRows('orders');
    const channels = [...new Set(orders.map((o) => o.channel))];

    // + per channel: every order, the returned ones, and the money of the completed ones - three
    //   aggregates over different rows, which no WHERE can ask for at once.
    const id = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', '*');
    await addAggregation(page, 1, 'COUNT', '*');
    await page.locator('#btnAggWhere-1').click();
    await page.locator('#selectAggWhereCol-1').selectOption('status');
    await page.locator('#selectAggWhereOp-1').selectOption('equals');
    await page.locator('#inputAggWhereValue-1').fill('returned');
    await addAggregation(page, 2, 'SUM', 'total_amount');
    await page.locator('#btnAggWhere-2').click();
    await page.locator('#selectAggWhereCol-2').selectOption('status');
    await page.locator('#inputAggWhereValue-2').fill('completed');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');

    const rows = await g4RowsWhere(page, id,
      (r) => r.length === channels.length && r.every((x) => 'count_where_status_returned' in x && 'total_amount_sum_where_status_completed' in x),
      'one row per channel, with the two conditional aggregates');
    for (const channel of channels) {
      const mine = orders.filter((o) => o.channel === channel);
      const row = rows.find((r) => r.channel === channel);
      expect(row, `a row for ${channel}`).toBeTruthy();
      expect(Number(row!.count), `${channel}: every order`).toBe(mine.length);
      expect(Number(row!.count_where_status_returned), `${channel}: the returned ones`)
        .toBe(mine.filter((o) => o.status === 'returned').length);
      const completed = mine.filter((o) => o.status === 'completed').reduce((sum, o) => sum + Number(o.total_amount), 0);
      expect(Math.abs(Number(row!.total_amount_sum_where_status_completed) - completed), `${channel}: the completed money`)
        .toBeLessThan(0.01);
    }

    // − the condition is the aggregate's own: without it the sum takes every order again.
    await page.locator('#btnRemoveAggWhere-2').click();
    await runVisualQuery(page);
    await g4RowsWhere(page, id,
      (r) => r.length === channels.length && r.every((x) => 'total_amount_sum' in x && Math.abs(Number(x.total_amount_sum)
        - orders.filter((o) => o.channel === x.channel).reduce((sum, o) => sum + Number(o.total_amount), 0)) < 0.01),
      'without its condition the sum is the plain sum of every order');
  });
});

test('(canvas mechanics) M69 A formula column: a condition, days between two dates and joined texts, summed and grouped', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M69 Formula', async () => {
    const orders = frozenRows('orders');
    const channels = [...new Set(orders.map((o) => o.channel))];
    const day = (text: string) => Date.parse(String(text).slice(0, 10)) / 86400000;

    // − a formula that does not read says why, in words, and is not in the query.
    const id = await eNewVisualWidget(page, 'orders');
    await page.locator('#btnAddFormula').click();
    await page.locator('#inputComputedName-0').fill('returned_money');
    await page.locator('#inputComputedFormula-0').fill('IF(status = 1, total_amount, 0)');
    await expect(page.locator('#computedFormulaError-0'), 'a text compared with a number is refused')
      .toContainText('a text cannot be compared with a number');

    // + per channel: the money of the returned orders (a condition) and the most days an
    //   order arrived after its promised date (DAYS between a date and a timestamp).
    await page.locator('#inputComputedFormula-0').fill("IF(status = 'returned', total_amount, 0)");
    await expect(page.locator('#computedFormulaError-0'), 'the corrected formula reads').toHaveCount(0);
    await page.locator('#btnAddFormula').click();
    await page.locator('#inputComputedName-1').fill('days_late');
    await page.locator('#inputComputedFormula-1').fill('DAYS(promised_date, delivered_ts)');
    await expect(page.locator('#computedFormulaError-1')).toHaveCount(0);
    await addAggregation(page, 0, 'SUM', 'returned_money');
    await addAggregation(page, 1, 'MAX', 'days_late');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');

    const rows = await g4RowsWhere(page, id,
      (r) => r.length === channels.length && r.every((x) => 'returned_money_sum' in x && 'days_late_max' in x),
      'one row per channel, with the two formula aggregates');
    for (const channel of channels) {
      const mine = orders.filter((o) => o.channel === channel);
      const row = rows.find((r) => r.channel === channel);
      expect(row, `a row for ${channel}`).toBeTruthy();
      const returned = mine.filter((o) => o.status === 'returned').reduce((sum, o) => sum + Number(o.total_amount), 0);
      expect(Math.abs(Number(row!.returned_money_sum) - returned), `${channel}: the returned money`).toBeLessThan(0.01);
      const late = Math.max(...mine.filter((o) => o.delivered_ts).map((o) => day(o.delivered_ts) - day(o.promised_date)));
      expect(Number(row!.days_late_max), `${channel}: the most days late`).toBe(late);
    }

    // + a text formula is a column to group by: one row per channel and device, joined.
    const route = await eNewVisualWidget(page, 'orders');
    await page.locator('#btnAddFormula').click();
    await page.locator('#inputComputedName-0').fill('route');
    await page.locator('#inputComputedFormula-0').fill("CONCAT(channel, ' / ', device)");
    await addAggregation(page, 0, 'COUNT', '*');
    await addGroupBy(page, 'route');
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');
    const routes = new Map<string, number>();
    for (const o of orders) routes.set(`${o.channel} / ${o.device}`, (routes.get(`${o.channel} / ${o.device}`) ?? 0) + 1);
    const byRoute = await g4RowsWhere(page, route,
      (r) => r.length === routes.size && r.every((x) => 'route' in x),
      'one row per channel and device');
    for (const [name, count] of routes) {
      expect(Number(byRoute.find((r) => r.route === name)?.count), `${name}: its orders`).toBe(count);
    }
  });
});

test('(canvas mechanics) M70 A cube answer sorted and cut to its first rows by clicks', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M70 Cube order and limit', async () => {
    // The truths, from the frozen rows: the orders each carrier took.
    const perCarrier = new Map<string, number>();
    for (const o of frozenRows('orders')) perCarrier.set(o.carrier, (perCarrier.get(o.carrier) ?? 0) + 1);
    const counts = [...perCarrier.values()];
    const largestFirst = [...counts].sort((a, b) => b - a);
    const carriersZtoA = [...perCarrier.keys()].sort().reverse();
    const cube = page.locator('#cubeQueryBuilderRenderer');
    const ordersOf = (rows: Array<Record<string, unknown>>) => rows.map((r) => Number(r.Orders));

    const id = await eNewVisualWidget(page, 'orders');
    await pickVisualCube(page, 'dd-delivery');
    await applyCubeSelection(page, { dimensions: ['Carrier'], measures: ['Orders'] });
    await switchToWidget(page, 'tabulator');
    await g4RowsWhere(page, id, (r) => r.length === perCarrier.size, 'one row per carrier');

    // + a click on the sort beside a ticked measure: largest first; the first 2 rows are the top 2.
    await cube.locator('#btnOrder-Orders').click();
    await cube.locator('#inputCubeLimit').fill('2');
    await cube.locator('#inputCubeLimit').press('Enter');
    const top2 = await g4RowsWhere(page, id, (r) => r.length === 2, 'the first 2 rows only');
    expect(ordersOf(top2), 'the 2 carriers with the most orders, largest first').toEqual(largestFirst.slice(0, 2));

    // + a second click: smallest first, still 2 rows.
    await cube.locator('#btnOrder-Orders').click();
    const bottom2 = await g4RowsWhere(page, id,
      (r) => r.length === 2 && Number(r[0].Orders) <= Number(r[1].Orders), 'the 2 smallest, smallest first');
    expect(ordersOf(bottom2)).toEqual([...counts].sort((a, b) => a - b).slice(0, 2));

    // − an empty box keeps every row again.
    await cube.locator('#inputCubeLimit').fill('');
    await cube.locator('#inputCubeLimit').press('Enter');
    const all = await g4RowsWhere(page, id, (r) => r.length === perCarrier.size, 'every carrier again');
    expect(ordersOf(all), 'still smallest first').toEqual([...counts].sort((a, b) => a - b));

    // + the sort beside a dimension sorts by it alone: carriers Z to A, the measure's sort gone.
    await cube.locator('#btnOrder-Carrier').click();
    // The whole order is waited for: the answer before it can start with the same carrier.
    const carrierOf = (r: Record<string, unknown>) => String(r.Carrier ?? Object.values(r)[0]);
    await g4RowsWhere(page, id,
      (r) => r.length === perCarrier.size && r.map(carrierOf).join('|') === carriersZtoA.join('|'),
      `carriers Z to A: ${carriersZtoA.join(', ')}`);
    await expect(cube.locator('#btnOrder-Orders'), 'one sort at a time').not.toHaveClass(/rb-order-on/);

    // + a second click on it: A to Z; − a third: no sort. Unticking the measure takes its button away.
    await cube.locator('#btnOrder-Carrier').click();
    const carriersAtoZ = [...carriersZtoA].reverse();
    await g4RowsWhere(page, id,
      (r) => r.length === perCarrier.size && r.map(carrierOf).join('|') === carriersAtoZ.join('|'),
      `carriers A to Z: ${carriersAtoZ.join(', ')}`);
    await cube.locator('#btnOrder-Carrier').click();
    await expect(cube.locator('#btnOrder-Carrier')).not.toHaveClass(/rb-order-on/);
    await cube.locator('#chk-meas-Orders').uncheck();
    await expect(cube.locator('#btnOrder-Orders')).toHaveCount(0);
  });
});

/** What a pivot draws, counted in its HTML: value cells with a heat colour, total cells, the grand total. */
async function m71Drawn(locator: Locator): Promise<{ heat: number; totals: number; grand: number }> {
  return locator.evaluate((el) => {
    // On the Canvas the locator is the pivot (its table is in its shadow root); published, it is the box around the table.
    const root: ParentNode = (el as HTMLElement).shadowRoot ?? el;
    const heat = Array.from(root.querySelectorAll('td.pvtVal')).filter((td) => (td as HTMLElement).style.backgroundColor !== '').length;
    return { heat, totals: root.querySelectorAll('td.pvtTotal').length, grand: root.querySelectorAll('td.pvtGrandTotal').length };
  });
}

/** Wait until the pivot draws `want` (heat: `true` = some cells coloured, `false` = none). */
async function m71WaitDrawn(locator: Locator, want: { heat: boolean; totals: number; grand: number }, message: string): Promise<void> {
  await expect.poll(async () => {
    const d = await m71Drawn(locator);
    return `heat=${d.heat > 0} totals=${d.totals} grand=${d.grand}`;
  }, { message, timeout: 30_000, intervals: [500] }).toBe(`heat=${want.heat} totals=${want.totals} grand=${want.grand}`);
}

test('(canvas mechanics) M71 A pivot drawn as a heatmap, its totals switched off and on, and the same published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId = '';
  try {
    await withFreshCanvas(page, 'E2E mech M71 Pivot heatmap and totals', async (canvasId) => {
      const rowsN = g5Statuses.length;
      const colsN = g5Channels.length;
      await addTableToCanvas(page, 'dash_demo.orders');
      await runSqlQuery(page, 'SELECT status, channel, total_amount FROM dash_demo.orders');
      await switchToWidget(page, 'pivot');
      const id = await getLastWidgetId(page);
      const pivot = cViz(page, id);
      await page.locator('#btnDisplayTab').click();
      await page.locator('#configPanel-pivot').waitFor({ state: 'visible', timeout: 10_000 });
      const assigned = page.locator('[id^="btnRemovePivotField-"]');
      for (let left = await assigned.count(); left > 0; left = await assigned.count()) {
        await assigned.first().click();
        await expect(assigned).toHaveCount(left - 1);
      }
      await cDragPivotField(page, 'status', 'rows');
      await cDragPivotField(page, 'channel', 'cols');
      await page.locator('#selectPivotAggregation').selectOption('Count');
      await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses) && cSame(x.colKeys, g5Channels), 'orders per status and channel');

      // − nothing picked: a plain table with both totals, as `<rb-pivot-table>` draws it published.
      await expect(page.locator('#selectPivotRenderer')).toHaveValue('Table');
      await expect(page.locator('#chkPivotRowTotals')).toBeChecked();
      await expect(page.locator('#chkPivotColTotals')).toBeChecked();
      await m71WaitDrawn(pivot, { heat: false, totals: rowsN + colsN, grand: 1 }, 'a plain table with a totals column, a totals row and the grand total');

      // + Show as: Heatmap colours the cells; the numbers do not change.
      await page.locator('#selectPivotRenderer').selectOption('Table Heatmap');
      const p = await cWaitPivot(pivot, (x) => x.state.rendererName === 'Table Heatmap', 'the pivot is a heatmap');
      g5ExpectCells(p, g5Counts(), 'a heatmap counts what the table counted');
      await m71WaitDrawn(pivot, { heat: true, totals: rowsN + colsN, grand: 1 }, 'the cells are coloured');

      // − each total switched off on its own, then the row totals back on.
      await page.locator('#chkPivotRowTotals').uncheck();
      await m71WaitDrawn(pivot, { heat: true, totals: colsN, grand: 0 }, 'no totals column: only the totals row, and no grand total');
      await page.locator('#chkPivotColTotals').uncheck();
      await m71WaitDrawn(pivot, { heat: true, totals: 0, grand: 0 }, 'no totals at all');
      await page.locator('#chkPivotRowTotals').check();
      await m71WaitDrawn(pivot, { heat: true, totals: rowsN, grand: 0 }, 'the totals column only');

      // + published, the reader sees what the author saw: a heatmap with the totals column only.
      const cid = (await getCanvasComponentIds(page, canvasId)).pivot[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, published.reportId);
      const shown = page.locator(`[id="widgetPivot-${cid}"]`);
      await expect(shown, 'the published pivot is on the page').toBeVisible({ timeout: 60_000 });
      await cWaitPivot(shown, (x) => x.state.rendererName === 'Table Heatmap' && cSame(x.rowKeys, g5Statuses),
        'the published pivot is a heatmap of the same rows');
      await m71WaitDrawn(shown, { heat: true, totals: rowsN, grand: 0 }, 'published: coloured cells and the totals column only');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M72 A filter compares two columns, and two filter rows make one OR group', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M72 Column filter and OR group', async () => {
    const orders = frozenRows('orders');
    // Late, as the dd-delivery cube says it: delivered on a later day than the one promised.
    const late = orders.filter((o) => o.delivered_ts !== '' && o.delivered_ts.slice(0, 10) > o.promised_date).length;
    const s1 = 'returned';
    const s2 = g5Statuses.find((s) => s !== s1 && s !== 'completed') ?? 'completed';

    // + delivered_ts after promised_date: the value of the filter is another column, compared as whole days.
    const id = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'delivered_ts', 'greater_than');
    await page.locator('#btnFilterValueColumn-0').click();
    await page.locator('#selectFilterValueColumn-0').selectOption('promised_date');
    await addAggregation(page, 0, 'COUNT', '*');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, late, 'the orders delivered after their promised day');

    // − back to a value: the column picker goes and the value box is back.
    await page.locator('#btnFilterValueColumn-0').click();
    await expect(page.locator('#selectFilterValueColumn-0')).toHaveCount(0);
    await expect(page.locator('#inputFilterValue-0')).toBeVisible();
    await page.locator('#btnRemoveFilter-0').click();

    // − two statuses and a channel, all AND-ed: no order has two statuses.
    await addVisualFilter(page, 0, 'status', 'equals', s1);
    await addVisualFilter(page, 1, 'status', 'equals', s2);
    await addVisualFilter(page, 2, 'channel', 'equals', 'web');
    await expect(page.locator('#btnFilterJoin-1'), 'rows are joined by and until one is switched').toHaveText('and');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, 0, 'one order cannot have two statuses');

    // + the second row joined by or: (s1 OR s2) AND web.
    await page.locator('#btnFilterJoin-1').click();
    await expect(page.locator('#btnFilterJoin-1')).toHaveText('or');
    await runVisualQuery(page);
    await g4ScalarIs(page, id,
      orders.filter((o) => (o.status === s1 || o.status === s2) && o.channel === 'web').length,
      `the ${s1} or ${s2} orders of the web channel`);

    // − matching any filter joins every row with OR already: no join to choose.
    await page.locator('#selectFilterMatch').selectOption('any');
    await expect(page.locator('#btnFilterJoin-1')).toHaveCount(0);
    await runVisualQuery(page);
    await g4ScalarIs(page, id,
      orders.filter((o) => o.status === s1 || o.status === s2 || o.channel === 'web').length,
      'any of the three');
  });
});

test('(canvas mechanics) M73 Quick calcs: the change from the month before, and a rank', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M73 Quick calcs', async () => {
    const orders = frozenRows('orders');
    const perMonth = new Map<string, number>();
    for (const o of orders) perMonth.set(o.order_ts.slice(0, 7), (perMonth.get(o.order_ts.slice(0, 7)) ?? 0) + Number(o.total_amount));
    const sums = [...perMonth.keys()].sort().map((m) => perMonth.get(m)!);

    // + money per month read as its change from the month before: the first month has none.
    const id = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'SUM', 'total_amount');
    await addGroupBy(page, 'order_ts');
    await setTimeBucket(page, 'order_ts', 'month');
    await page.locator('#selectQuickCalc-0').selectOption('change');
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');
    const rows = await g4RowsWhere(page, id,
      (r) => r.length === sums.length && r.every((x) => 'total_amount_sum_change' in x), 'one row per month, with its change');
    const changes = [...rows].sort((a, b) => String(a.order_ts).localeCompare(String(b.order_ts)))
      .map((r) => r.total_amount_sum_change);
    expect(changes[0] === null || changes[0] === undefined || changes[0] === '', 'the first month has no month before').toBe(true);
    for (let i = 1; i < sums.length; i++) {
      expect(Math.abs(Number(changes[i]) - (sums[i] - sums[i - 1])), `month ${i + 1}: its change`).toBeLessThan(0.01);
    }

    // + orders per channel read as a rank: the busiest channel is 1; no change offered without a time bucket.
    const perChannel = new Map<string, number>();
    for (const o of orders) perChannel.set(o.channel, (perChannel.get(o.channel) ?? 0) + 1);
    const rid = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', '*');
    await addGroupBy(page, 'channel');
    await expect(page.locator('#selectQuickCalc-0 option[value="change"]'), 'a change needs a time bucket').toHaveCount(0);
    await page.locator('#selectQuickCalc-0').selectOption('rank');
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');
    const ranked = await g4RowsWhere(page, rid,
      (r) => r.length === perChannel.size && r.every((x) => 'count_rank' in x), 'one row per channel, with its rank');
    for (const [channel, count] of perChannel) {
      const expected = 1 + [...perChannel.values()].filter((n) => n > count).length;
      expect(Number(ranked.find((r) => r.channel === channel)?.count_rank), `${channel}: its rank`).toBe(expected);
    }
  });
});

test('(canvas mechanics) M74 A limit bound to a dashboard filter, a filter row switched by a checkbox', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M74 Bound limit and switched filter', async () => {
    const orders = frozenRows('orders');
    expect(orders.some((o) => o.status === 'returned'), 'the demo has returned orders').toBe(true);
    const topCounts = (rows: Record<string, string>[], n: number) => {
      const perChannel = new Map<string, number>();
      for (const o of rows) perChannel.set(o.channel, (perChannel.get(o.channel) ?? 0) + 1);
      return [...perChannel.values()].sort((a, b) => b - a).slice(0, n);
    };
    const shownCounts = (rows: Record<string, unknown>[]) => rows.map((r) => Number(r.count)).sort((a, b) => b - a);

    await addFilterBarParam(page, `reportParameters {
  parameter(id: 'includeReturns', type: 'Boolean', label: 'Include returns', defaultValue: false) {
    constraints(required: false)
    ui(control: 'checkbox')
  }
  parameter(id: 'topN', type: 'Integer', label: 'How many', defaultValue: 2) {
    constraints(required: true)
    ui(control: 'select', options: [[value: 2, label: '2'], [value: 3, label: '3']])
  }
}
`);

    // + returned orders left out unless the checkbox is ticked; as many channels as the filter asks for.
    const id = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'status', 'not_equals', 'returned');
    await page.locator('#selectFilterSwitch-0').selectOption('includeReturns:off');
    await addAggregation(page, 0, 'COUNT', '*');
    await addGroupBy(page, 'channel');
    await addVisualSort(page, 0, 'count', 'DESC');
    await page.locator('#selectBindLimit').selectOption('topN');
    await expect(page.locator('#chipLimitParam'), 'the limit is bound to ${topN}').toBeVisible();
    await expect(page.locator('#inputLimit'), 'no typed limit while bound').toHaveCount(0);
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');
    const kept = orders.filter((o) => o.status !== 'returned');
    let rows = await g4RowsWhere(page, id, (r) => r.length === 2, 'two channels');
    expect(shownCounts(rows), 'the two busiest channels, returns left out').toEqual(topCounts(kept, 2));

    // + three channels once the filter says 3.
    await page.locator('#formReportParameters #topN').selectOption('3');
    rows = await g4RowsWhere(page, id, (r) => r.length === 3, 'three channels');
    expect(shownCounts(rows), 'the three busiest channels, returns left out').toEqual(topCounts(kept, 3));

    // + ticking the checkbox switches the filter row off: returns are counted.
    await page.locator('#formReportParameters #includeReturns').check();
    rows = await g4RowsWhere(page, id,
      (r) => r.length === 3 && shownCounts(r).join() === topCounts(orders, 3).join(), 'returns counted');
    expect(shownCounts(rows), 'the three busiest channels, returns counted').toEqual(topCounts(orders, 3));

    // − the chip's x unbinds the limit: a typed limit is asked for again.
    await page.locator('#btnUnbindLimit').click();
    await expect(page.locator('#chipLimitParam'), 'the chip is gone').toHaveCount(0);
    await expect(page.locator('#inputLimit'), 'a typed limit again').toBeVisible();
  });
});

/** The bounds a chart's axis is drawn with (`chart.scales.<axis>`); on the Canvas the locator is the
 *  chart itself, published it is the chart's box inside the chart's shadow root. */
async function m75Bounds(chart: Locator, axis: 'x' | 'y'): Promise<{ min: number; max: number } | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el, a) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    const scale = instance?.scales?.[a];
    return scale ? { min: Number(scale.min), max: Number(scale.max) } : null;
  }, axis);
}

test('(canvas mechanics) M75 Chart axis min and max', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M75 Chart axis bounds', async (canvasId) => {
      const orders = frozenRows('orders');
      const perChannel = new Map<string, number>();
      for (const o of orders) perChannel.set(o.channel, (perChannel.get(o.channel) ?? 0) + 1);
      const most = Math.max(...perChannel.values());
      const min = 5;
      const max = most * 2;

      // + a bar chart's value axis drawn from the typed min and max; both stored on y.
      const id = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputChartAxisMin').fill(String(min));
      await page.locator('#inputChartAxisMax').fill(String(max));
      await expect.poll(async () => m75Bounds(cViz(page, id), 'y'), { timeout: 15_000 }).toEqual({ min, max });
      let stored = await eStoredWidgets(page, canvasId,
        (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y?.max === max);
      expect(stored[0].displayConfig.dslConfig.options.scales.y, 'stored on y').toEqual({ min, max });

      // + a row chart measures along x: the bounds go with the values.
      await setChartType(page, 'row');
      await expect.poll(async () => m75Bounds(cViz(page, id), 'x'), { timeout: 15_000 }).toEqual({ min, max });
      stored = await eStoredWidgets(page, canvasId,
        (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.x?.max === max);
      expect(stored[0].displayConfig.dslConfig.options.scales.y, 'nothing left on y').toBeUndefined();

      // − a min above the max is pointed out; emptied boxes give the axis back to the chart.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputChartAxisMin').fill(String(max + 1));
      await expect(page.locator('#chartAxisBoundsError')).toBeVisible();
      await page.locator('#inputChartAxisMin').fill('');
      await page.locator('#inputChartAxisMax').fill('');
      await expect(page.locator('#chartAxisBoundsError')).toHaveCount(0);
      stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.scales === undefined);
      expect(stored[0].displayConfig.dslConfig.options?.scales, 'no bounds stored').toBeUndefined();
      await expect.poll(async () => (await m75Bounds(cViz(page, id), 'x'))?.max, { timeout: 15_000 }).not.toBe(max);

      // − a pie has no value axis to bound.
      await setChartType(page, 'pie');
      await page.locator('#btnDisplayTab').click();
      await expect(page.locator('#inputChartAxisMin')).toHaveCount(0);

      // + a bar chart again, bounded, draws the same once published.
      await setChartType(page, 'bar');
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputChartAxisMin').fill(String(min));
      await page.locator('#inputChartAxisMax').fill(String(max));
      await expect.poll(async () => m75Bounds(cViz(page, id), 'y'), { timeout: 15_000 }).toEqual({ min, max });
      await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y?.max === max);
      let ids: Record<string, string[]> = {};
      await expect
        .poll(async () => {
          ids = await getCanvasComponentIds(page, canvasId);
          return (ids.chart ?? []).length === 1;
        }, { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] })
        .toBe(true);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect
        .poll(async () => m75Bounds(page.locator(`[id="widgetChart-${ids.chart[0]}"]`), 'y'),
          { message: 'the published chart has the same bounds', timeout: 60_000, intervals: [1_000] })
        .toEqual({ min, max });
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M76 A date range: one control, two dates, presets from the data\'s today', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M76 Date range', async (canvasId) => {
      // The demo data's today is 2026-09-30 (`dash_demo.as_of`): the presets count from it, as M66's
      // relative dates do. Both days of a range are included.
      const day = (r: Record<string, string>): string => r.order_ts.slice(0, 10);
      const between = (from: string, to: string) => pCount((r) => day(r) >= from && day(r) <= to);
      expect(between('2026-09-24', '2026-09-30'), 'the seeded data has orders in its own last week').toBeGreaterThan(0);

      // + `dateFrom` asks for a range: it and `dateTo` are drawn as one control with presets.
      await addFilterBarParam(page, `reportParameters {
  parameter(id: 'dateFrom', type: 'Date', label: 'Period', defaultValue: '2026-01-02') {
    constraints(required: false)
    ui(control: 'date-range')
  }
  parameter(id: 'dateTo', type: 'Date', label: 'To', defaultValue: '2026-09-30') {
    constraints(required: false)
  }
}
`);
      const bar = page.locator('#formReportParameters');
      await expect(bar.locator('#dateFrom_range'), 'one range control').toBeVisible();
      await expect(bar.locator('#dateFrom_range #dateTo'), 'the last day is inside the range').toBeVisible();
      await expect(bar.locator('label[for="dateTo"]'), 'and not drawn again on its own').toHaveCount(0);
      await expect(bar.locator('#dateFrom_preset'), 'the defaults are days of the author\'s own').toHaveValue('');

      // + a count of orders between the two dates, both ends bound.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addVisualFilter(page, 0, 'order_ts', 'between');
      await bindVisualFilterToParam(page, 0, 'dateFrom');
      await bindVisualFilterToParam(page, 0, 'dateTo', 'valueTo');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, between('2026-01-02', '2026-09-30'), 'the defaults: 2 January to the data\'s today');

      // + a preset fills both days at once, from the data's today.
      await bar.locator('#dateFrom_preset').selectOption('last_7_days');
      await expect(bar.locator('#dateFrom')).toHaveValue('2026-09-24');
      await expect(bar.locator('#dateTo')).toHaveValue('2026-09-30');
      await g4ScalarIs(page, kpi, between('2026-09-24', '2026-09-30'), 'the last 7 days end on the data\'s today');
      await bar.locator('#dateFrom_preset').selectOption('last_year');
      await expect(bar.locator('#dateFrom')).toHaveValue('2025-01-01');
      await expect(bar.locator('#dateTo')).toHaveValue('2025-12-31');
      await g4ScalarIs(page, kpi, between('2025-01-01', '2025-12-31'), 'last year is the year before the data\'s');

      // − a day typed by hand is the reader's own: the preset says Custom, the count follows the days.
      await bar.locator('#dateFrom_preset').selectOption('year_to_date');
      await bar.locator('#dateFrom').fill('2026-09-02');
      await expect(bar.locator('#dateFrom_preset')).toHaveValue('');
      await g4ScalarIs(page, kpi, between('2026-09-02', '2026-09-30'), 'a typed first day');

      // + published: the page's own range, counted from the same today.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length;
      }, { message: 'the saved canvas holds the number widget', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubBar = page.locator('#parameterBarContainer');
      await expect(pubBar.locator('#dateFrom_range'), 'published, the same range control').toBeVisible({ timeout: 30_000 });
      await pPublishedNumberIs(page, ids.number[0], between('2026-01-02', '2026-09-30'), 'published, the defaults');
      await pubBar.locator('#dateFrom_preset').selectOption('quarter_to_date');
      await expect(pubBar.locator('#dateFrom')).toHaveValue('2026-07-01');
      await expect(pubBar.locator('#dateTo')).toHaveValue('2026-09-30');
      await reloadDashboard(pubBar);
      await pPublishedNumberIs(page, ids.number[0], between('2026-07-01', '2026-09-30'),
        'published, the quarter to the data\'s today');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** The values a select of the filter bar offers, sorted, its empty "no value" choice left out. */
async function m77Offered(bar: Locator, id: string): Promise<string[]> {
  const values = await bar.locator(`select#${id} option`).evaluateAll(
    (options) => options.map((o) => (o as HTMLOptionElement).value));
  return values.filter((v) => v !== '').sort();
}

test('(canvas mechanics) M77 Cascading filters: a city list that follows the country', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M77 Cascading filters', async (canvasId) => {
      const cities = frozenRows('geo_cities');
      const citiesOf = (code: string) => cities.filter((c) => c.country_code === code).map((c) => c.city).sort();
      expect(citiesOf('DE').length, 'the demo has German cities').toBeGreaterThan(1);
      expect(citiesOf('FR').length, 'and French ones').toBeGreaterThan(1);

      // + the city list's SELECT names ${country}: it offers the default country's cities.
      await addFilterBarParam(page, `reportParameters {
  parameter(id: 'country', type: 'String', label: 'Country', defaultValue: 'DE') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT DISTINCT country_code AS value, country AS label FROM dash_demo.geo_cities ORDER BY label')
  }
  parameter(id: 'city', type: 'String', label: 'City', defaultValue: 'Berlin') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT city FROM dash_demo.geo_cities WHERE country_code = \${country} ORDER BY city')
  }
}
`);
      const bar = page.locator('#formReportParameters');
      await expect.poll(async () => m77Offered(bar, 'city'), { timeout: 20_000 }).toEqual(citiesOf('DE'));
      await expect(bar.locator('#city_dependsOn'), 'the form says what the list follows').toContainText('Country');

      // + the filter dialog names the filter the SELECT reads.
      await page.locator('#btnConfigureFilters').click();
      await expect(page.locator('[id="paramOptionsUses-city"]')).toContainText('country');
      await page.locator('#btnCloseFilterConfig').click();

      // + a count of the cities the city filter keeps: one, Berlin.
      const kpi = await eNewVisualWidget(page, 'geo_cities');
      await addVisualFilter(page, 0, 'city', 'equals');
      await bindVisualFilterToParam(page, 0, 'city');
      await addAggregation(page, 0, 'COUNT', 'city_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, 1, 'Berlin');

      // + another country: the list is France's, and Berlin, no longer offered, is no filter any more.
      await bar.locator('#country').selectOption('FR');
      await expect.poll(async () => m77Offered(bar, 'city'), { timeout: 20_000 }).toEqual(citiesOf('FR'));
      await g4ScalarIs(page, kpi, cities.length, 'no city picked: every city');
      await bar.locator('#city').selectOption('Lyon');
      await g4ScalarIs(page, kpi, 1, 'Lyon');

      // + published: the same list, asked again of the server when the country changes.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length;
      }, { message: 'the saved canvas holds the number widget', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubBar = page.locator('#parameterBarContainer');
      await expect.poll(async () => m77Offered(pubBar, 'city'), { timeout: 30_000 }).toEqual(citiesOf('DE'));
      await pPublishedNumberIs(page, ids.number[0], 1, 'published, Berlin');
      await pubBar.locator('#country').selectOption('FR');
      await expect.poll(async () => m77Offered(pubBar, 'city'), { timeout: 30_000 }).toEqual(citiesOf('FR'));
      await pubBar.locator('#city').selectOption('Marseille');
      await reloadDashboard(pubBar);
      await pPublishedNumberIs(page, ids.number[0], 1, 'published, Marseille');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M78 A long select can be searched; Apply and Reset on the published page', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M78 Search Apply Reset', async (canvasId) => {
      const cities = frozenRows('geo_cities').map((c) => c.city);
      expect(cities.length, 'a list long enough to search').toBeGreaterThan(10);
      const matching = (text: string) => cities.filter((c) => c.toLowerCase().includes(text)).sort();

      await addFilterBarParam(page, `reportParameters {
  parameter(id: 'city', type: 'String', label: 'City', defaultValue: '') {
    constraints(required: false)
    ui(control: 'select', options: 'SELECT city FROM dash_demo.geo_cities ORDER BY city')
  }
}
`);
      // + a long single select gets a search box; what is typed narrows the list.
      const bar = page.locator('#formReportParameters');
      await expect(bar.locator('#city_search')).toBeVisible();
      await bar.locator('#city_search').fill('ly');
      await expect.poll(async () => m77Offered(bar, 'city'), { timeout: 10_000 }).toEqual(matching('ly'));
      await bar.locator('#city').selectOption('Lyon');

      const kpi = await eNewVisualWidget(page, 'geo_cities');
      await addVisualFilter(page, 0, 'city', 'equals');
      await bindVisualFilterToParam(page, 0, 'city');
      await addAggregation(page, 0, 'COUNT', 'city_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, 1, 'Lyon');

      // − a search with no match leaves only the city the filter holds.
      await bar.locator('#city_search').fill('zzz');
      await expect.poll(async () => m77Offered(bar, 'city'), { timeout: 10_000 }).toEqual(['Lyon']);

      // + published: search, Apply at once, then Reset back to the defaults.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length;
      }, { message: 'the saved canvas holds the number widget', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubBar = page.locator('#parameterBarContainer');
      await pPublishedNumberIs(page, ids.number[0], cities.length, 'published, no city: every city');
      await pubBar.locator('#city_search').fill('mar');
      await expect.poll(async () => m77Offered(pubBar, 'city'), { timeout: 10_000 }).toEqual(matching('mar'));
      await pubBar.locator('#city').selectOption('Marseille');
      await pubBar.locator('#btnReloadDashboard').click();
      await expect(pubBar.locator('#btnConfirmReload'), 'Apply asks nothing').toHaveCount(0);
      await pPublishedNumberIs(page, ids.number[0], 1, 'published, Marseille');
      await pubBar.locator('#btnResetDashboard').click();
      await pPublishedNumberIs(page, ids.number[0], cities.length, 'Reset: the default, every city');
      await expect(pubBar.locator('#city_search'), 'and the search is cleared').toHaveValue('');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** What a download holds, as text. */
async function m79Text(download: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('(canvas mechanics) M79 The menu on a published tile: CSV, PNG, maximise, refresh', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M79 Tile menu', async (canvasId) => {
      const orders = frozenRows('orders');
      const channels = [...new Set(orders.map((o) => o.channel))];

      // A chart and a table of orders per channel.
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      // The published tiles carry the component ids the export gives the widgets.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.chart ?? []).length === 1 && (ids.tabulator ?? []).length === 1;
      }, { message: 'the saved canvas names the chart and the table', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const chart = ids.chart[0];
      const table = ids.tabulator[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);

      // + the table's CSV: a header and a line per channel, its numbers the frozen rows'.
      await page.locator(`[id="widgetMenu-${table}"]`).click();
      await expect(page.locator(`[id="widgetMenuPng-${table}"]`), 'a table is not a picture').toHaveCount(0);
      const [csv] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(`[id="widgetMenuCsv-${table}"]`).click(),
      ]);
      expect(csv.suggestedFilename()).toMatch(/\.csv$/);
      const lines = (await m79Text(csv)).trim().split(/\r?\n/);
      expect(lines.length, 'a header and one line per channel').toBe(channels.length + 1);
      const total = lines.slice(1).reduce((sum, line) => sum + Number(line.split(',').pop()), 0);
      expect(total, 'the counts add up to every order').toBe(orders.length);

      // + the chart as a PNG.
      await page.locator(`[id="widgetMenu-${chart}"]`).click();
      const [png] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(`[id="widgetMenuPng-${chart}"]`).click(),
      ]);
      expect(png.suggestedFilename()).toMatch(/\.png$/);
      const head = await m79Text(png);
      expect(head.length, 'an image was saved').toBeGreaterThan(100);

      // + maximise fills the page with the tile; Escape gives it its place back.
      const chartTile = page.locator('.grid-item', { has: page.locator(`[id="widgetMenu-${chart}"]`) });
      await page.locator(`[id="widgetMenu-${chart}"]`).click();
      await page.locator(`[id="widgetMenuMaximise-${chart}"]`).click();
      await expect(chartTile).toHaveClass(/rb-tile-maximised/);
      await page.keyboard.press('Escape');
      await expect(chartTile).not.toHaveClass(/rb-tile-maximised/);

      // + refresh draws the tile again from a new element: the old one is gone, the rows are back.
      await page.evaluate((cid) => {
        const el = document.querySelector(`[component-id="${cid}"]`) as (HTMLElement & { __m79?: boolean }) | null;
        if (el) el.__m79 = true;
      }, table);
      await page.locator(`[id="widgetMenu-${table}"]`).click();
      await page.locator(`[id="widgetMenuRefresh-${table}"]`).click();
      await expect.poll(async () => page.evaluate((cid) => {
        const el = document.querySelector(`[component-id="${cid}"]`) as (HTMLElement & { __m79?: boolean }) | null;
        return !!el && el.__m79 !== true;
      }, table), { message: 'a new element took the tile', timeout: 15_000 }).toBe(true);
      await pWaitCells(page, table, (cells) => cells.length === channels.length, 'the refreshed table has its rows');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** Where each tile of the published grid sits, against the grid's own width. */
async function m80Tiles(page: Page): Promise<Array<{ share: number; left: number; top: number; bottom: number }>> {
  return page.evaluate(() => {
    const grid = document.querySelector('.dashboard-grid') as HTMLElement;
    const g = grid.getBoundingClientRect();
    return Array.from(grid.children).map((tile) => {
      const r = tile.getBoundingClientRect();
      return { share: r.width / g.width, left: r.left - g.left, top: r.top, bottom: r.bottom };
    });
  });
}

test('(canvas mechanics) M80 On a phone the published dashboard is one column', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  const wideViewport = page.viewportSize();
  try {
    await withFreshCanvas(page, 'E2E mech M80 Phone layout', async (canvasId) => {
      const channels = new Set(frozenRows('orders').map((o) => o.channel));

      // A chart and a table of orders per channel, side by side.
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      await layoutWidgetsByDrag(page, [{ x: 0, y: 0, w: 6, h: 4 }, { x: 6, y: 0, w: 6, h: 4 }]);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      let tables: string[] = [];
      await expect.poll(async () => (tables = (await getCanvasComponentIds(page, canvasId)).tabulator ?? []).length,
        { message: 'the saved canvas names the table', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const table = tables[0];
      await openPublished(page, reportId);
      await pWaitCells(page, table, (cells) => cells.length === channels.size, 'the table has its rows');

      // + on a wide screen the two tiles share the row.
      const wide = await m80Tiles(page);
      expect(wide.length).toBe(2);
      expect(wide[0].share, 'half the row').toBeLessThan(0.6);
      expect(wide[1].top, 'the same row').toBeCloseTo(wide[0].top, 0);

      // + on a phone each tile is the full width, one under the other, in the canvas's order.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(async () => (await m80Tiles(page)).every((t) => t.share > 0.98 && Math.abs(t.left) < 1),
        { message: 'every tile takes the full width', timeout: 15_000, intervals: [500] }).toBe(true);
      const narrow = await m80Tiles(page);
      expect(narrow[1].top, 'the table under the chart').toBeGreaterThanOrEqual(narrow[0].bottom);
      expect(await page.evaluate(() => {
        const root = document.querySelector('.rb-dashboard-root') as HTMLElement;
        return root.scrollWidth <= root.clientWidth + 1;
      }), 'nothing runs off the side').toBe(true);
      await pWaitCells(page, table, (cells) => cells.length === channels.size, 'the table still shows its rows');
    });
  } finally {
    if (wideViewport) await page.setViewportSize(wideViewport);
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** Click the country cell of the row a table draws for `code` (`tabCell-<cid>-<row>-country_code`). */
async function m81ClickCountry(page: Page, componentId: string, code: string): Promise<void> {
  const cell = page.locator(`[id^="tabCell-${componentId}-"][id$="-country_code"]`, { hasText: code }).first();
  await expect(cell, `the table draws a row for ${code}`).toBeVisible({ timeout: 30_000 });
  await cell.click();
}

/** The rows the drill panel holds, read off its table's own data. */
async function m81Rows(page: Page): Promise<Array<Record<string, unknown>>> {
  const table = page.locator('#widgetDrillModal rb-tabulator');
  if ((await table.count()) === 0) return [];
  return table.first().evaluate((el) => ((el as unknown as { data?: Array<Record<string, unknown>> }).data ?? []));
}

test('(canvas mechanics) M81 A click on a bar or a table row opens the rows behind it', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M81 Rows behind a click', async (canvasId) => {
      const cities = frozenRows('geo_cities');
      const kept = (code: string) => cities.filter((c) => c.country_code === code && c.city !== 'Berlin');
      expect(kept('DE').length, 'German cities other than Berlin').toBeGreaterThan(1);
      expect(kept('FR').length, 'and French ones').toBeGreaterThan(1);
      const rowsAre = async (code: string, message: string) => {
        await expect.poll(async () => (await m81Rows(page)).length, { message, timeout: 30_000, intervals: [500] })
          .toBe(kept(code).length);
        const rows = await m81Rows(page);
        expect(rows.every((r) => r.country_code === code && r.city !== 'Berlin'),
          `${message}: the rows of ${code}, Berlin filtered out as the widget filters it`).toBe(true);
      };

      // A chart and a table of the cities per country, Berlin filtered out.
      const chartW = await eNewVisualWidget(page, 'geo_cities');
      await addVisualFilter(page, 0, 'city', 'not_equals', 'Berlin');
      await addAggregation(page, 0, 'COUNT', 'city_id');
      await addGroupBy(page, 'country_code');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      const tableW = await eNewVisualWidget(page, 'geo_cities');
      await addVisualFilter(page, 0, 'city', 'not_equals', 'Berlin');
      await addAggregation(page, 0, 'COUNT', 'city_id');
      await addGroupBy(page, 'country_code');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');

      // + Canvas: the bar DE opens the German rows, under the widget's own filter.
      await pClickBar(page.locator(`[id="widgetViz-${chartW}"]`), 'DE');
      await expect(page.locator('#widgetDrillModal'), 'the rows open').toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#widgetDrillTitle'), 'and say which group').toContainText('country_code DE');
      await rowsAre('DE', 'canvas, a bar');
      await page.locator('#btnWidgetDrillClose').click();
      await expect(page.locator('#widgetDrillModal')).toHaveCount(0);

      // + Canvas: the table's FR row opens the French rows; Escape puts them away.
      await m81ClickCountry(page, tableW, 'FR');
      await rowsAre('FR', 'canvas, a row');
      await page.keyboard.press('Escape');
      await expect(page.locator('#widgetDrillModal')).toHaveCount(0);

      // + published: the same clicks open the same rows, asked of the report.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.chart ?? []).length === 1 && (ids.tabulator ?? []).length === 1;
      }, { message: 'the saved canvas names the chart and the table', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await pClickBar(page.locator(`[id="widgetChart-${ids.chart[0]}"]`), 'DE');
      await expect(page.locator('#widgetDrillModal'), 'published, the rows open').toBeVisible({ timeout: 30_000 });
      await rowsAre('DE', 'published, a bar');
      await page.locator('#btnWidgetDrillClose').click();
      await expect(page.locator('#widgetDrillModal')).toHaveCount(0);
      await m81ClickCountry(page, ids.tabulator[0], 'FR');
      await rowsAre('FR', 'published, a row');
      await page.keyboard.press('Escape');
      await expect(page.locator('#widgetDrillModal')).toHaveCount(0);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M82 Dashboard settings: refresh every N minutes; a page made for paper', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M82 Auto refresh and print', async (canvasId) => {
      const channels = new Set(frozenRows('orders').map((o) => o.channel));

      // A filter bar, and a table of orders per channel.
      await addFilterBarParam(page, `reportParameters {
  parameter(id: 'minTotal', type: 'Integer', label: 'Minimum total', defaultValue: 0) {
    constraints(required: false)
  }
}
`);
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');

      // + the settings dialog: minutes, a whole number from 1 up, or nothing for never.
      await page.locator('#btnDashboardSettings').click();
      await expect(page.locator('#dashboardSettings')).toBeVisible();
      await page.locator('#inputAutoRefresh').fill('ten');
      await expect(page.locator('#autoRefreshError')).toBeVisible();
      await page.locator('#inputAutoRefresh').fill('1');
      await expect(page.locator('#autoRefreshHint')).toContainText('every 1 minute');
      await page.locator('#btnCloseDashboardSettings').click();
      await expect(page.locator('#dashboardSettings')).toHaveCount(0);
      await expect.poll(async () => {
        const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
        const state = JSON.parse(((await response.json()) as { state: string }).state);
        return state.dashboardSettings?.autoRefreshMinutes;
      }, { message: 'the canvas keeps the setting', timeout: 30_000, intervals: [1_000] }).toBe(1);

      let tables: string[] = [];
      await expect.poll(async () => (tables = (await getCanvasComponentIds(page, canvasId)).tabulator ?? []).length,
        { message: 'the saved canvas names the table', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const table = tables[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await pWaitCells(page, table, (cells) => cells.length === channels.size, 'the table has its rows');
      await expect(page.locator('.rb-dashboard-root')).toHaveAttribute('data-auto-refresh', '1');

      // + a minute later the tile asks again by itself: a new element in its place, the rows back.
      await page.evaluate((cid) => {
        const el = document.querySelector(`[component-id="${cid}"]`) as (HTMLElement & { __m82?: boolean }) | null;
        if (el) el.__m82 = true;
      }, table);
      await expect.poll(async () => page.evaluate((cid) => {
        const el = document.querySelector(`[component-id="${cid}"]`) as (HTMLElement & { __m82?: boolean }) | null;
        return !!el && el.__m82 !== true;
      }, table), { message: 'the dashboard refreshed itself', timeout: 100_000, intervals: [2_000] }).toBe(true);
      await pWaitCells(page, table, (cells) => cells.length === channels.size, 'the refreshed table has its rows');

      // + on paper: the filters keep their values and lose their buttons, the tile menu is gone, no
      //   tile is cut in two, the page is white.
      await page.emulateMedia({ media: 'print' });
      try {
        await expect(page.locator('#btnReloadDashboard')).toBeHidden();
        await expect(page.locator('#minTotal')).toBeVisible();
        await expect(page.locator(`[id="widgetMenu-${table}"]`)).toBeHidden();
        const looks = await page.evaluate(() => {
          const root = document.querySelector('.rb-dashboard-root') as HTMLElement;
          const tile = document.querySelector('.rb-dashboard-root .grid-item') as HTMLElement;
          return { background: getComputedStyle(root).backgroundColor, breakInside: getComputedStyle(tile).breakInside };
        });
        expect(looks.background, 'a white page').toBe('rgb(255, 255, 255)');
        expect(looks.breakInside, 'no tile cut in two').toBe('avoid');
      } finally {
        await page.emulateMedia({ media: 'screen' });
      }
      await expect(page.locator('#btnReloadDashboard'), 'on screen the buttons are back').toBeVisible();
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M83 A click still filters after Apply and after a tile\'s Refresh', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M83 Clicks after Apply', async (canvasId) => {
      const web = (r: Record<string, string>) => r.channel === 'web';

      // A filter bar, a KPI of the orders, and a bar chart whose clicks filter the dashboard.
      await addFilterBarParam(page, `reportParameters {
  parameter(id: 'minTotal', type: 'Integer', label: 'Minimum total', defaultValue: 0) {
    constraints(required: false)
  }
}
`);
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await setClicksFilter(page, 'chart', true);

      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length === 1 && (ids.chart ?? []).length === 1;
      }, { message: 'the saved canvas names the KPI and the chart', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const kpi = ids.number[0];
      const chart = ids.chart[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const chartEl = () => page.locator(`[id="widgetChart-${chart}"]`);
      const bar = page.locator('#parameterBarContainer');
      await pPublishedNumberIs(page, kpi, pOrders.length, 'every order');

      // + a click selects the web orders.
      await pClickBar(chartEl(), 'web');
      await pPublishedNumberIs(page, kpi, pCount(web), 'a click: the web orders');

      // + Apply keeps the click's selection: the tiles come back still filtered by it.
      await reloadDashboard(bar);
      await pPublishedNumberIs(page, kpi, pCount(web), 'after Apply, still the web orders');
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'and its chip').toBeVisible();

      // + the chart Apply put on the page still hears clicks: a second click takes the selection back.
      await pClickBar(chartEl(), 'web');
      await pPublishedNumberIs(page, kpi, pOrders.length, 'a click after Apply brings every order back');
      await expect(page.locator('#selectionBar')).toHaveCount(0);

      // + a tile's Refresh puts a new chart in its place, and its clicks filter too.
      await page.locator(`[id="widgetMenu-${chart}"]`).click();
      await page.locator(`[id="widgetMenuRefresh-${chart}"]`).click();
      await pClickBar(chartEl(), 'web');
      await pPublishedNumberIs(page, kpi, pCount(web), 'a click after Refresh: the web orders');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M84 A title and a subtitle over a widget, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M84 Widget titles', async (canvasId) => {
      // A KPI left as it is, and a bar chart of the orders per channel that gets a title.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');

      // + the two boxes at the top of the Display tab; what is typed is over the widget at once.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputWidgetTitle').fill('Orders by channel');
      await page.locator('#inputWidgetSubtitle').fill('Every order, <b>as placed</b>');
      await expect(page.locator(`[id="widgetTitle-${chart}"]`)).toHaveText('Orders by channel');
      await expect(page.locator(`[id="widgetSubtitle-${chart}"]`), 'shown as typed, never as markup')
        .toHaveText('Every order, <b>as placed</b>');
      await expect(page.locator(`[id="widgetTitle-${kpi}"]`), 'a widget with no title shows none').toHaveCount(0);

      // + the published tiles say the same, the KPI's none.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length === 1 && (ids.chart ?? []).length === 1;
      }, { message: 'the saved canvas names the KPI and the chart', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await expect.poll(async () => {
        const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
        const state = JSON.parse(((await response.json()) as { state: string }).state);
        return (state.widgets as { type: string; displayConfig?: { widgetSubtitle?: string } }[])
          .find((w) => w.type === 'chart')?.displayConfig?.widgetSubtitle;
      }, { message: 'the canvas keeps the subtitle', timeout: 30_000, intervals: [1_000] })
        .toBe('Every order, <b>as placed</b>');
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect(page.locator(`[id="tileTitle-${ids.chart[0]}"]`)).toHaveText('Orders by channel');
      await expect(page.locator(`[id="tileSubtitle-${ids.chart[0]}"]`)).toHaveText('Every order, <b>as placed</b>');
      await expect(page.locator(`[id="tileTitle-${ids.number[0]}"]`)).toHaveCount(0);
      await expect(page.locator(`[id="widgetChart-${ids.chart[0]}"]`), 'and the chart under them').toBeVisible();
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** The data labels a chart wrote on itself last (#24), read off its Chart.js instance. */
async function cValueLabels(chart: Locator): Promise<string[] | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    return instance ? ((instance.$rbValueLabels as string[] | undefined) ?? []) : null;
  });
}

test('(canvas mechanics) M85 Data labels on the bars, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M85 Data labels', async (canvasId) => {
      // Each channel's order count, as a label reads it.
      const expected = pChannels.map((c) => pCount((r) => r.channel === c).toLocaleString('en-US')).sort();
      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'a bar per channel');

      // - as it was: no labels on the bars.
      await expect.poll(async () => cValueLabels(cViz(page, chart)), { message: 'no labels yet', timeout: 30_000 })
        .toEqual([]);

      // + on: one label per bar, its count.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#btnChartLabels-on').click();
      await expect.poll(async () => (await cValueLabels(cViz(page, chart)))?.slice().sort(),
        { message: 'the Canvas writes each count on its bar', timeout: 30_000, intervals: [1_000] }).toEqual(expected);

      // + the published chart writes the same labels.
      let charts: string[] = [];
      await expect.poll(async () => (charts = (await getCanvasComponentIds(page, canvasId)).chart ?? []).length,
        { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] }).toBe(1);
      await expect.poll(async () => {
        const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
        return ((await response.json()) as { state: string }).state.includes('rbValueLabels');
      }, { message: 'the canvas keeps the setting', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect.poll(async () => (await cValueLabels(page.locator(`[id="widgetChart-${charts[0]}"]`)))?.slice().sort(),
        { message: 'the published chart writes the same counts', timeout: 60_000, intervals: [1_000] }).toEqual(expected);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** How a drawn chart stacks (#25): its value axis's stacked and max, and each stack's total. */
async function cStacks(chart: Locator): Promise<{ stacked: unknown; max: unknown; totals: number[] } | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    if (!instance) return null;
    const y = instance.config.options?.scales?.y ?? {};
    const datasets: { data: unknown[] }[] = instance.data.datasets ?? [];
    const length = Math.max(0, ...datasets.map((ds) => ds.data.length));
    const totals = Array.from({ length }, (_, j) =>
      Math.round(datasets.reduce((sum, ds) => sum + (Number(ds.data[j]) || 0), 0) * 100) / 100);
    return { stacked: y.stacked, max: y.max, totals };
  });
}

test('(canvas mechanics) M86 Stacked areas, and bars stacked to 100%, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M86 Stacking', async (canvasId) => {
      // The orders per channel, split by status.
      const chart = await eNewVisualWidget(page, 'orders');
      await addGroupBy(page, 'channel');
      await addGroupBy(page, 'status');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');

      // + an area chart stacks, as it always did, and can now be told not to.
      await setChartType(page, 'area');
      await page.locator('#btnDisplayTab').click();
      await expect.poll(async () => (await cStacks(cViz(page, chart)))?.stacked,
        { message: 'an area chart stacks by itself', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await page.locator('#btnChartStacked-off').click();
      await expect.poll(async () => (await cStacks(cViz(page, chart)))?.stacked,
        { message: 'off: the areas overlap', timeout: 30_000, intervals: [1_000] }).toBe(false);
      await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.scales?.y?.stacked === false);

      // + the bars stacked to 100%: every channel's stack makes 100.
      await setChartType(page, 'bar');
      await page.locator('#btnDisplayTab').click();
      await page.locator('#btnChartStacked-percent').click();
      const every100 = (s: { stacked: unknown; max: unknown; totals: number[] } | null) =>
        !!s && s.stacked === true && s.max === 100 && s.totals.length === pChannels.length && s.totals.every((t) => t === 100);
      await expect.poll(async () => every100(await cStacks(cViz(page, chart))),
        { message: 'each channel is 100%', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.rbStack100 === true);

      // + the published chart draws the same shares.
      let charts: string[] = [];
      await expect.poll(async () => (charts = (await getCanvasComponentIds(page, canvasId)).chart ?? []).length,
        { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect.poll(async () => every100(await cStacks(page.locator(`[id="widgetChart-${charts[0]}"]`))),
        { message: 'published, each channel is 100% too', timeout: 60_000, intervals: [1_000] }).toBe(true);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** A drawn chart's value-axis tick labels, as Chart.js wrote them. */
async function cValueTicks(chart: Locator): Promise<string[] | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    if (!instance?.scales?.y) return null;
    return (instance.scales.y.ticks as { label: unknown }[]).map((t) => String(t.label));
  });
}

test('(canvas mechanics) M87 A chart written in a number format, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M87 Chart number format', async (canvasId) => {
      const compact = (n: number) => n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
      const expected = pChannels.map((c) => compact(pCount((r) => r.channel === c))).sort();
      // Every tick but zero is written short: 4K, 8K, 12K.
      const shortTicks = (ticks: string[] | null) =>
        !!ticks && ticks.length > 1 && ticks.every((t) => t === '0' || /^\d+(\.\d)?K$/.test(t));

      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'a bar per channel');

      // - as it was: Chart.js writes the ticks in full (12,000).
      await expect.poll(async () => shortTicks(await cValueTicks(cViz(page, chart))),
        { message: 'full numbers on the axis', timeout: 30_000 }).toBe(false);

      // + Compact: the axis and the labels read 13.2K, the way a table column and a KPI write it.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#btnChartLabels-on').click();
      await page.locator('#selectChartNumberFormat').selectOption('compact');
      await expect.poll(async () => shortTicks(await cValueTicks(cViz(page, chart))),
        { message: 'the axis is written short', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await expect.poll(async () => (await cValueLabels(cViz(page, chart)))?.slice().sort(),
        { message: 'and so are the labels', timeout: 30_000, intervals: [1_000] }).toEqual(expected);

      // + published, the same.
      let charts: string[] = [];
      await expect.poll(async () => (charts = (await getCanvasComponentIds(page, canvasId)).chart ?? []).length,
        { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] }).toBe(1);
      await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.rbNumberFormat === 'compact');
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pub = () => page.locator(`[id="widgetChart-${charts[0]}"]`);
      await expect.poll(async () => shortTicks(await cValueTicks(pub())),
        { message: 'the published axis is written short', timeout: 60_000, intervals: [1_000] }).toBe(true);
      await expect.poll(async () => (await cValueLabels(pub()))?.slice().sort(),
        { message: 'and its labels', timeout: 30_000, intervals: [1_000] }).toEqual(expected);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** The text of a table's totals row in one column, digits only. */
async function tTotal(table: Locator, field: string): Promise<string> {
  const cell = table.locator(`.tabulator-calcs-bottom .tabulator-cell[tabulator-field="${field}"]`).first();
  if ((await cell.count()) === 0) return '';
  return (await cell.innerText()).replace(/[^0-9]/g, '');
}

/** How many of a table's drawn cells carry a highlight of this kind. */
async function tHighlighted(table: Locator, kind: string): Promise<number> {
  return table.locator(`.tabulator-row:not(.tabulator-calcs) [data-rb-highlight="${kind}"]`).count();
}

test('(canvas mechanics) M88 Tables: a totals row, search, dragged columns, highlights; Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M88 Table extras', async (canvasId) => {
      const webOrders = pCount((r) => r.channel === 'web');
      const largest = Math.max(...pChannels.map((c) => pCount((r) => r.channel === c)));
      const table = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      await pWaitRows(page, table, (rows) => rows.length === pChannels.length, 'a row per channel');
      const canvasTable = page.locator(`[id="widgetViz-${table}"]`);
      await page.locator('#btnDisplayTab').click();

      // + the totals row sums the counts: every order.
      await page.locator('#chkTableTotals').check();
      await expect.poll(async () => tTotal(page.locator(`[id="widgetViz-${table}"]`), 'order_id_count'),
        { message: 'the Canvas totals row', timeout: 30_000, intervals: [1_000] }).toBe(String(pOrders.length));

      // + a search box over each column narrows the rows.
      await page.locator('#chkTableSearch').check();
      const channelFilter = canvasTable.locator('.tabulator-col[tabulator-field="channel"] .tabulator-header-filter input');
      await expect(channelFilter, 'a search box over the channels').toBeVisible({ timeout: 30_000 });
      // Tabulator searches as keys are let go: the box is typed into, not just filled.
      await channelFilter.fill('web');
      await channelFilter.press('End');
      await expect.poll(async () => canvasTable.locator('.tabulator-row:not(.tabulator-calcs)').count(),
        { message: 'only the web row is left', timeout: 30_000, intervals: [1_000] }).toBe(1);
      await channelFilter.fill('');
      await channelFilter.press('End');

      // + highlights: a bar in every count, then one colour above a line only the biggest channel crosses.
      await page.locator('#chkTableMovableColumns').check();
      await page.locator('#selectTableHighlightField').selectOption('order_id_count');
      await page.locator('#selectTableHighlightKind').selectOption('bars');
      await expect.poll(async () => tHighlighted(page.locator(`[id="widgetViz-${table}"]`), 'bars'),
        { message: 'a bar in every count', timeout: 30_000, intervals: [1_000] }).toBe(pChannels.length);
      await page.locator('#selectTableHighlightKind').selectOption('above');
      await page.locator('#inputTableHighlightValue').fill(String(largest - 1));
      await expect(page.locator('[id="tableHighlight-order_id_count"]')).toContainText(`above ${largest - 1}`);
      await expect.poll(async () => tHighlighted(page.locator(`[id="widgetViz-${table}"]`), 'above'),
        { message: 'one count above the line', timeout: 30_000, intervals: [1_000] }).toBe(1);

      // + the published table: the same totals, search, highlight, and its columns can be dragged.
      let tables: string[] = [];
      await expect.poll(async () => (tables = (await getCanvasComponentIds(page, canvasId)).tabulator ?? []).length,
        { message: 'the saved canvas names the table', timeout: 30_000, intervals: [1_000] }).toBe(1);
      await eStoredWidgets(page, canvasId, (w) => {
        const dsl = w[0]?.displayConfig?.dslConfig ?? {};
        return dsl.rbTotals === true && dsl.movableColumns === true && dsl.columnDefaults?.headerFilter === 'input'
          && dsl.rbHighlights?.[0]?.value === largest - 1;
      });
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pub = page.locator(`[component-id="${tables[0]}"]`);
      await pWaitCells(page, tables[0], (cells) => cells.length === pChannels.length, 'the published rows');
      await expect.poll(async () => tTotal(pub, 'order_id_count'),
        { message: 'the published totals row', timeout: 30_000, intervals: [1_000] }).toBe(String(pOrders.length));
      await expect.poll(async () => tHighlighted(pub, 'above'),
        { message: 'the published highlight', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const pubFilter = pub.locator('.tabulator-col[tabulator-field="channel"] .tabulator-header-filter input');
      await pubFilter.fill('web');
      await pubFilter.press('End');
      await expect.poll(async () => pub.locator('.tabulator-row:not(.tabulator-calcs)').count(),
        { message: 'the published search', timeout: 30_000, intervals: [1_000] }).toBe(1);
      expect((await pub.locator('.tabulator-row:not(.tabulator-calcs)').first().innerText()).replace(/[^0-9]/g, ''),
        'the row left is the web orders').toBe(String(webOrders));
      await pubFilter.fill('');
      await pubFilter.press('End');

      // A column is dragged by holding it a moment, then moving it.
      const fields = async () => pub.locator('.tabulator-header .tabulator-col[tabulator-field]')
        .evaluateAll((cols) => cols.map((c) => c.getAttribute('tabulator-field')));
      expect((await fields())[0], 'the channels come first').toBe('channel');
      const from = await pub.locator('.tabulator-col[tabulator-field="order_id_count"] .tabulator-col-title').boundingBox();
      const to = await pub.locator('.tabulator-col[tabulator-field="channel"] .tabulator-col-title').boundingBox();
      await page.mouse.move(from!.x + 5, from!.y + from!.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.move(to!.x + 20, to!.y + to!.height / 2, { steps: 10 });
      await page.mouse.move(to!.x + 2, to!.y + to!.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect.poll(async () => (await fields())[0],
        { message: 'the count, dragged first', timeout: 15_000, intervals: [500] }).toBe('order_id_count');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** A drawn chart's categories and its first series' values, as Chart.js holds them. */
async function cBars(chart: Locator): Promise<{ labels: string[]; values: number[] } | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    if (!instance) return null;
    return {
      labels: (instance.data.labels ?? []).map(String),
      values: (instance.data.datasets?.[0]?.data ?? []).map(Number),
    };
  });
}

test('(canvas mechanics) M89 The top N bars and one "Other", in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M89 Top N and Other', async (canvasId) => {
      // The two biggest channels stay, in the order the query gives them; the rest are one "Other".
      const counts = pChannels.map((c) => ({ c, n: pCount((r) => r.channel === c) }));
      const top = new Set([...counts].sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.c));
      const other = counts.filter((x) => !top.has(x.c)).reduce((sum, x) => sum + x.n, 0);
      const folded = (s: { labels: string[]; values: number[] } | null) =>
        !!s && s.labels.length === 3 && s.labels[2] === 'Other' && s.values[2] === other
        && s.labels.slice(0, 2).every((l) => top.has(l));

      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'bar');
      await cWaitChart(page, chart, (s) => cSame([...new Set(s.labels)], pChannels), 'a bar per channel');

      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputChartTopN').fill('2');
      await page.locator('#inputChartTopN').press('Enter');
      await expect.poll(async () => folded(await cBars(cViz(page, chart))),
        { message: 'two channels and Other', timeout: 30_000, intervals: [1_000] }).toBe(true);

      // - "Other" is many channels at once: with clicks filtering the dashboard, a click on it selects nothing.
      await setClicksFilter(page, 'chart', true);
      await pClickBar(cViz(page, chart), 'Other');
      await expect(page.locator('#selectionBar'), 'a click on Other selects nothing').toHaveCount(0);

      // + published, the same three bars.
      let charts: string[] = [];
      await expect.poll(async () => (charts = (await getCanvasComponentIds(page, canvasId)).chart ?? []).length,
        { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] }).toBe(1);
      await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.options?.rbTopN === 2);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect.poll(async () => folded(await cBars(page.locator(`[id="widgetChart-${charts[0]}"]`))),
        { message: 'published: two channels and Other', timeout: 60_000, intervals: [1_000] }).toBe(true);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M90 The words a widget says when its query answers no rows, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M90 No data message', async (canvasId) => {
      const words = 'No orders on this channel yet';
      // A KPI that has rows, and a table whose query answers none; both are given the same words.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputNoDataMessage').fill(words);
      await page.locator('#btnDataTab').click();

      const empty = await fAddTabulator(page, 'dash_demo.orders',
        "SELECT channel, COUNT(*) AS n FROM dash_demo.orders WHERE channel = 'nowhere' GROUP BY channel");
      await page.locator('#btnDisplayTab').click();
      await page.locator('#inputNoDataMessage').fill(words);

      // + the table with no rows says the words; the KPI, which has rows, shows its number.
      await expect(page.locator(`[id="widgetNoData-${empty}"]`)).toHaveText(words, { timeout: 30_000 });
      await expect(page.locator(`[id="widgetNoData-${kpi}"]`), 'a widget with rows shows them').toHaveCount(0);

      // + published, the same.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length === 1 && (ids.tabulator ?? []).length === 1;
      }, { message: 'the saved canvas names both widgets', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await eStoredWidgets(page, canvasId, (w) => w.filter((x) => x.displayConfig?.noDataMessage === words).length === 2);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await pPublishedNumberIs(page, ids.number[0], pOrders.length, 'the published KPI counts every order');
      await expect(page.locator(`[id="tileNoData-${ids.tabulator[0]}"]`), 'the published table says the words')
        .toHaveText(words, { timeout: 60_000 });
      await expect(page.locator(`[id="tileNoData-${ids.number[0]}"]`)).toHaveCount(0);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M91 One colour set for every chart of a dashboard, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M91 Dashboard palette', async (canvasId) => {
    const warm = '#d62728';
    const pastel = '#a8dadc';

    // Orders per channel twice, as bars: one chart names no colours, the other picks its own.
    const plain = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    const houseColour = (await pChartColors(page, plain))[0];
    expect(houseColour, 'the plain chart starts in the house colours').not.toBe(warm);

    const own = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    await switchToWidget(page, 'chart');
    await setChartType(page, 'bar');
    await clickDisplayTab(page);
    await page.locator('#btnChartPalette-pastel').click();
    await expect.poll(async () => (await pChartColors(page, own))[0],
      { message: 'the other chart takes its own colours', timeout: 20_000, intervals: [500] }).toBe(pastel);

    // + the settings dialog: warm for every chart. The plain chart turns warm, the other keeps its own.
    await page.locator('#btnDashboardSettings').click();
    await expect(page.locator('#dashboardSettings')).toBeVisible();
    await page.locator('#btnDashboardPalette-warm').click();
    await page.locator('#btnCloseDashboardSettings').click();
    await expect(page.locator('#dashboardSettings')).toHaveCount(0);
    await expect.poll(async () => [(await pChartColors(page, plain))[0], (await pChartColors(page, own))[0]],
      { message: 'the plain chart turns warm, the other keeps pastel', timeout: 20_000, intervals: [500] })
      .toEqual([warm, pastel]);
    await expect.poll(async () => {
      const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
      const state = JSON.parse(((await response.json()) as { state: string }).state);
      return state.dashboardSettings?.palette;
    }, { message: 'the canvas keeps the setting', timeout: 30_000, intervals: [1_000] }).toBe('warm');

    // + Published: the page names the set, and the two charts are drawn as in the Canvas.
    const published = await publishDashboard(page);
    await openPublished(page, published.reportId);
    await expect(page.locator('.rb-dashboard-root')).toHaveAttribute('data-palette', 'warm');
    await expect.poll(async () => (await pPublishedChartColors(page)).map((c) => c.colors[0]).sort(),
      { message: 'published, the plain chart is warm and the other pastel', timeout: 60_000, intervals: [1_000] })
      .toEqual([warm, pastel].sort());
    await page.goBack();
    await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });

    // + back to Default: the plain chart is in the house colours again.
    await page.locator('#btnDashboardSettings').click();
    await page.locator('#btnDashboardPalette-default').click();
    await page.locator('#btnCloseDashboardSettings').click();
    await expect.poll(async () => (await pChartColors(page, plain))[0],
      { message: 'Default gives the house colours back', timeout: 20_000, intervals: [500] }).toBe(houseColour);
  });
});

test('(canvas mechanics) M92 A filter value picked from the column\'s own values, and a day from a calendar', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M92 Filter value pickers', async () => {
    const orders = frozenRows('orders');
    const channels = [...new Set(orders.map((o) => o.channel))].sort();
    expect(channels.length, 'enough channels to pick from').toBeGreaterThan(2);
    const ofChannels = (...picked: string[]) => orders.filter((o) => picked.includes(o.channel)).length;

    // A text column: its own values beside the box, every one of them, in order.
    const id = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'channel', 'equals');
    const pick = page.locator('#selectFilterValuePick-0');
    const box = page.locator('#inputFilterValue-0');
    await expect.poll(async () => (await pick.locator('option').allTextContents()).slice(1),
      { message: 'the channels are offered', timeout: 30_000, intervals: [500] }).toEqual(channels);
    await pick.selectOption(channels[0]);
    await expect(box, 'the picked value is in the box').toHaveValue(channels[0]);
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await g4ScalarIs(page, id, ofChannels(channels[0]), 'the picked value filters');

    // + "in": each pick adds to the list.
    await page.locator('#selectFilterOp-0').selectOption('in');
    await pick.selectOption(channels[1]);
    await pick.selectOption(channels[1]);
    await expect(box, 'a value is in the list once').toHaveValue(`${channels[0]}, ${channels[1]}`);
    await runVisualQuery(page);
    await g4ScalarIs(page, id, ofChannels(channels[0], channels[1]), 'two picks, two channels');

    // + typing still works.
    await box.fill(channels[2]);
    await runVisualQuery(page);
    await g4ScalarIs(page, id, ofChannels(channels[2]), 'a typed value still filters');

    // A date column: no list of values, a calendar instead, whose day goes into the box. The days
    // are far outside the data, which is moved to today when it is seeded.
    const promised = orders.filter((o) => /^\d{4}-\d{2}-\d{2}/.test(o.promised_date ?? '')).length;
    const day = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'promised_date', 'greater_or_equal');
    await expect(page.locator('#selectFilterValuePick-0'), 'a date column has no list of values').toHaveCount(0);
    await page.locator('#inputFilterDatePick-0').fill('2000-01-01');
    await expect(page.locator('#inputFilterValue-0'), 'the picked day is in the box').toHaveValue('2000-01-01');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await g4ScalarIs(page, day, promised, 'every order is promised on or after 2000');
    await page.locator('#inputFilterDatePick-0').fill('2100-01-01');
    await runVisualQuery(page);
    await g4ScalarIs(page, day, 0, 'none is promised on or after 2100');

    // + between: a calendar beside each box.
    await page.locator('#selectFilterOp-0').selectOption('between');
    await page.locator('#inputFilterDatePick-0').fill('2000-01-01');
    await page.locator('#inputFilterDatePickTo-0').fill('2100-01-01');
    await expect(page.locator('#inputFilterValueTo-0'), 'the second day is in the second box').toHaveValue('2100-01-01');
    await runVisualQuery(page);
    await g4ScalarIs(page, day, promised, 'every order is promised between 2000 and 2100');
  });
});

test('(canvas mechanics) M93 The median, and a moving average next to the running total', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M93 Median and moving average', async () => {
    const orders = frozenRows('orders');
    const medianOf = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // The median of the order totals per channel, as the frozen rows have it.
    const med = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'MEDIAN', 'total_amount');
    await addGroupBy(page, 'channel');
    await runVisualQuery(page);
    // Grouped, the widget draws itself as a chart; the rows are read off a table.
    await switchToWidget(page, 'tabulator');
    const channels = [...new Set(orders.map((o) => o.channel))];
    const medians = await g4RowsWhere(page, med, (r) => r.length === channels.length && 'total_amount_median' in r[0],
      'one median per channel');
    for (const channel of channels) {
      const row = medians.find((r) => r.channel === channel);
      const want = medianOf(orders.filter((o) => o.channel === channel).map((o) => Number(o.total_amount)));
      expect(Number(row?.total_amount_median), `the median of ${channel}`).toBeCloseTo(want, 2);
    }

    // The order totals per month, and beside them their moving average: each month's is the mean
    // of it and the two months before (the first months, of what there is). The months are read off
    // the answer itself, because the data is moved to today when it is seeded.
    const mov = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'SUM', 'total_amount');
    await addAggregation(page, 1, 'SUM', 'total_amount');
    await addGroupBy(page, 'order_ts');
    await setTimeBucket(page, 'order_ts', 'month');
    await page.locator('#checkMovingAverage-1').check();
    await runVisualQuery(page);
    await switchToWidget(page, 'tabulator');
    const months = (await g4RowsWhere(page, mov, (r) => r.length > 3 && 'total_amount_sum_moving' in r[0],
      'a moving average per month'))
      .sort((a, b) => String(a.order_ts).localeCompare(String(b.order_ts)));
    months.forEach((row, i) => {
      const window = months.slice(Math.max(0, i - 2), i + 1).map((m) => Number(m.total_amount_sum));
      expect(Number(row.total_amount_sum_moving), `the moving average of ${String(row.order_ts)}`)
        .toBeCloseTo(window.reduce((a, b) => a + b, 0) / window.length, 2);
    });

    // + one reading at a time: the running total clears it.
    await page.locator('#checkRunningTotal-1').check();
    await expect(page.locator('#checkMovingAverage-1')).not.toBeChecked();
  });

  // On a database with no median, the step does not offer one.
  await withFreshCanvas(page, 'E2E mech M93 No median on SQLite', async () => {
    await addTableToCanvas(page, 'Orders');
    await page.locator('#btnQueryTab-visual').click();
    await addAggregation(page, 0, 'COUNT', '*');
    const offered = await page.locator('#selectAggFunc-0 option').evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value));
    expect(offered, 'the other aggregates are offered').toContain('AVG');
    expect(offered, 'no median on SQLite').not.toContain('MEDIAN');
  }, 'rbt-sample-northwind-sqlite-4f2');
});

test('(canvas mechanics) M94 More filter operators: does not contain, today, yesterday, the quarter and the year before', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M94 More operators', async () => {
    // A text column: the rows whose channel does not hold the letters, whatever their case.
    const kpi = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'channel', 'not_contains', 'WEB');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    const withoutWeb = pCount((r) => !r.channel.toLowerCase().includes('web'));
    expect(withoutWeb, 'some orders are not web ones').toBeGreaterThan(0);
    await g4ScalarIs(page, kpi, withoutWeb, 'does not contain, whatever the case');

    // A date column: the periods count from the data's today, 2026-09-30 here (M66), and take no value.
    await page.locator('#btnRemoveFilter-0').click();
    await addVisualFilter(page, 0, 'order_ts', 'today');
    await expect(page.locator('#inputFilterValue-0'), 'a period takes no value').toHaveCount(0);
    const day = (r: Record<string, string>): string => r.order_ts.slice(0, 10);
    const periods: Array<[string, (d: string) => boolean]> = [
      ['today', (d) => d === '2026-09-30'],
      ['yesterday', (d) => d === '2026-09-29'],
      ['previous_quarter', (d) => d >= '2026-04-01' && d < '2026-07-01'],
      ['previous_year', (d) => d >= '2025-01-01' && d < '2026-01-01'],
    ];
    for (const [operator, inPeriod] of periods) {
      await page.locator('#selectFilterOp-0').selectOption(operator);
      await runVisualQuery(page);
      await g4ScalarIs(page, kpi, pCount((r) => inPeriod(day(r))), `${operator} counts from the data's today`);
    }
    expect(pCount((r) => day(r) >= '2026-04-01' && day(r) < '2026-07-01'), 'the previous quarter has orders').toBeGreaterThan(0);
  });
});

test('(canvas mechanics) M95 Duplicate a widget; duplicate, rename and search canvases; a new canvas from a demo', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  const api = 'http://localhost:9090/api/explorations';
  const name = `E2E mech M95 Authoring ${Date.now()}`;
  const made: string[] = [];
  type Saved = { id: string; name: string; state: string; connectionId: string | null; exportedReportCode: string | null };
  const saved = async (id: string): Promise<Saved> => (await page.request.get(`${api}/${id}`)).json();
  try {
    await withFreshCanvas(page, name, async (canvasId) => {
      // A widget with settings of its own: its query and a title. Sorted, so the original and its copy
      // answer in one order (a GROUP BY alone leaves the order to the database).
      const id = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await addVisualSort(page, 0, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      await clickDisplayTab(page);
      await page.locator('#inputWidgetTitle').fill('Orders by channel');
      await expect(page.locator(`#widgetTitle-${id}`)).toHaveText('Orders by channel');
      const rows = await eWidgetRows(page, id);

      // + Duplicate, in the widget's "⋯" menu: a new id, the same settings, next to it.
      await page.locator(`#btnWidgetActions-${id}`).click();
      await page.locator(`#btnDuplicateWidget-${id}`).click();
      const copy = await getLastWidgetId(page);
      expect(copy, 'the copy has an id of its own').not.toBe(id);
      await expect(page.locator(`#widgetTitle-${copy}`), 'the copy keeps the title').toHaveText('Orders by channel');
      expect(await eWidgetRows(page, copy), 'the copy answers the same rows').toEqual(rows);
      await expect.poll(async () => {
        const widgets = (JSON.parse((await saved(canvasId)).state).widgets ?? []) as Array<{
          id: string; type: string; gridPosition: { x: number; y: number; w: number; h: number };
        }>;
        const a = widgets.find((w) => w.id === id)?.gridPosition;
        const b = widgets.find((w) => w.id === copy);
        if (!a || !b) return 'not saved yet';
        const beside = b.gridPosition.y === a.y && b.gridPosition.x === a.x + a.w;
        const under = b.gridPosition.x === a.x && b.gridPosition.y >= a.y + a.h;
        return `${b.type} placed ${beside || under ? 'next to it' : 'elsewhere'}`;
      }, { message: 'the canvas keeps the copy, next to the widget', timeout: 30_000, intervals: [1_000] })
        .toBe('tabulator placed next to it');

      // The canvas list: a search box over the names.
      await page.goto(CANVAS_LIST_URL);
      const search = page.locator('#inputSearchCanvases');
      await search.fill(name);
      await expect(page.locator('[id^="canvasCard-"]'), 'the search finds the canvas by its name').toHaveCount(1);
      await expect(page.locator(`#canvasCard-${canvasId}`)).toBeVisible();
      await search.fill(`${name} and no other`);
      await expect(page.locator('#txtNoCanvasMatch'), 'a name nothing has says so').toBeVisible();
      await search.fill(name.toUpperCase());
      await expect(page.locator('[id^="canvasCard-"]'), 'whatever the case').toHaveCount(1);

      // + Duplicate: "<name> (copy)", the same widgets, published nowhere.
      await page.locator(`#btnDuplicateCanvas-${canvasId}`).click({ force: true });
      await expect(page.locator('[id^="canvasCard-"]'), 'the copy is listed beside it').toHaveCount(2);
      const all = (await (await page.request.get(api)).json()) as Saved[];
      const dup = all.find((c) => c.name === `${name} (copy)`);
      expect(dup, 'the copy is named after the canvas').toBeTruthy();
      made.push(dup!.id);
      expect((JSON.parse(dup!.state).widgets as Array<{ id: string }>).map((w) => w.id), 'the copy holds the same widgets')
        .toEqual((JSON.parse((await saved(canvasId)).state).widgets as Array<{ id: string }>).map((w) => w.id));
      expect(dup!.exportedReportCode, 'the copy is published nowhere').toBeFalsy();

      // + Rename the copy: Enter keeps the typed name.
      await page.locator(`#btnRenameCanvas-${dup!.id}`).click({ force: true });
      await page.locator(`#inputRenameCanvas-${dup!.id}`).fill(`${name} renamed`);
      await page.locator(`#inputRenameCanvas-${dup!.id}`).press('Enter');
      await expect(page.locator(`#canvasName-${dup!.id}`)).toHaveText(`${name} renamed`);
      await expect.poll(async () => (await saved(dup!.id)).name,
        { message: 'the new name is saved', timeout: 20_000, intervals: [500] }).toBe(`${name} renamed`);

      // + New from a demo: the shipped demo canvases, and a copy of one, opened at once. Every one is
      //   offered, the 25 originals and their "(low-code)" twins, each by its folder in the samples.
      const fs = await import('fs');
      const path = await import('path');
      const { E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH } = await import('../../utils/paths');
      const samples = path.join(E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH, 'db-template/config/samples');
      const demoCanvases = fs.readdirSync(samples)
        .filter((d) => d.startsWith('g-dd-') && fs.existsSync(path.join(samples, d, `${d}.canvas.json`)))
        .sort();
      expect(demoCanvases.filter((d) => !d.endsWith('-low-code')).length, 'the 25 demos ship').toBe(25);
      await page.locator('#btnNewFromDemo').click();
      await expect(page.locator('#dlgNewFromDemo')).toBeVisible();
      await expect.poll(async () => (await page.locator('[id^="btnDemoCanvas-"]').evaluateAll(
        (els) => els.map((el) => el.id.slice('btnDemoCanvas-'.length)))).sort(),
        { message: 'every shipped demo canvas is offered', timeout: 10_000 }).toEqual(demoCanvases);
      await page.locator('#btnDemoCanvas-g-dd-fulfillment').click();
      await page.waitForURL(/\/explore-data\/canvas-/, { timeout: 30_000 });
      const fromDemo = page.url().split('/explore-data/')[1].split(/[?#]/)[0];
      made.push(fromDemo);
      const shipped = JSON.parse(fs.readFileSync(path.join(samples, 'g-dd-fulfillment/g-dd-fulfillment.canvas.json'), 'utf8'));
      const opened = await saved(fromDemo);
      expect(opened.name, 'named as the demo').toBe(shipped.name);
      expect(opened.connectionId, 'on the demo\'s connection').toBe(shipped.connection_id);
      expect(opened.exportedReportCode, 'published nowhere: the demo\'s dashboard stays the demo\'s').toBeFalsy();
      expect((JSON.parse(opened.state).widgets as Array<{ id: string }>).map((w) => w.id), 'the demo\'s widgets')
        .toEqual((shipped.state.widgets as Array<{ id: string }>).map((w) => w.id));
      await expect(page.locator('[id^="widget-w-"]').first(), 'the copy opens with its widgets').toBeVisible({ timeout: 60_000 });
    });
  } finally {
    for (const id of made) {
      await adminFetch(`${api}/${id}`, { method: 'DELETE' });
    }
  }
});

// #38: every SQL and script widget's answer is held to a row cap and a statement timeout on the
// server, set in one place (DataPallas.widgets.* in application.properties: 100,000 rows, 60 s).
// Going over is said on the widget, in words, instead of a browser drowning or a spinner forever.
test('(canvas mechanics) M96 A runaway widget says so instead of hanging', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M96 Row cap and timeout', async () => {
    await addTableToCanvas(page, 'dash_demo.orders');
    const id = await getLastWidgetId(page);
    const error = page.locator(`#widgetError-${id}`);

    // + one row past the cap: the widget says how many rows a widget shows.
    await runSqlQuery(page, 'SELECT range AS n FROM range(100001)');
    await expect(error, 'an answer over the cap is refused on the widget').toContainText('more than 100,000 rows', { timeout: 60_000 });

    // − an answer under the cap is drawn as before, and the error is gone.
    await runSqlQuery(page, 'SELECT order_id, channel FROM dash_demo.orders LIMIT 5');
    await expect(dRowCount(page)).toContainText('5 rows returned', { timeout: 30_000 });
    await expect(error, 'a query under the cap leaves no widget error').toHaveCount(0);

    // + a script whose answer is over the cap is refused the same way.
    await runGroovyScript(page, 'return (1..100001).collect { [n: it] }');
    await expect(error, 'a script answer over the cap is refused on the widget').toContainText('more than 100,000 rows', { timeout: 60_000 });

    // + a statement still running at the timeout is stopped, and the widget says so.
    await runSqlQuery(page, 'SELECT count(*) AS n FROM range(1000000) a, range(1000000) b, range(1000000) c');
    await expect(error, 'a statement past the timeout is stopped and named').toContainText('ran longer than 60 seconds', { timeout: 150_000 });

    // − and the widget answers again at once.
    await runSqlQuery(page, 'SELECT order_id, channel FROM dash_demo.orders LIMIT 5');
    await expect(dRowCount(page)).toContainText('5 rows returned', { timeout: 30_000 });
    await expect(error).toHaveCount(0);
  });
});

// #39: the Share dialog hands out the code a web page pastes to show the dashboard - the components'
// <script> and an <rb-dashboard> carrying an embed token minted with the dialog's own locks.
test('(canvas mechanics) M97 The Share dialog gives the embed code, with an embed token', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  let portalContext: BrowserContext | undefined;

  try {
    await withFreshCanvas(page, 'E2E mech M97 Embed code', async (canvasId) => {
      // A dashboard with one select filter and one number that answers to it.
      await addFilterBarParam(page, B_CHANNEL_FILTER_DSL);
      await bAddSqlNumber(page, B_CHANNEL_COUNT_SQL, 'orders');
      const published = await publishDashboard(page);
      reportId = published.reportId;
      const numberIds = (await getCanvasComponentIds(page, canvasId)).number;
      const truth = bOnlyNumber(await bData(page, reportId, numberIds[0], { channel: B_CHANNEL }));
      expect(truth, 'the locked channel has orders').toBeGreaterThan(0);

      // Share: lock the channel, then ask for the embed code.
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: AI_HUB_BASE_URL });
      await page.locator('#btnShareDashboard').click();
      await page.locator('#shareDialog').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#shareLockParam-channel').check();
      const lockValue = page.locator('#shareLockValue-channel');
      await lockValue.waitFor({ state: 'visible', timeout: 10_000 });
      await lockValue.locator('#channel').selectOption(B_CHANNEL);

      // − nothing is minted until it is asked for.
      await expect(page.locator('#shareEmbedCode'), 'no code before Get embed code').toHaveCount(0);
      await page.locator('#shareEmbedTtl').selectOption('86400');
      await page.locator('#btnCreateEmbedCode').click();
      const codeBox = page.locator('#shareEmbedCode');
      await codeBox.waitFor({ state: 'visible', timeout: 15_000 });
      const code = await codeBox.inputValue();
      expect(code, 'the code loads the components').toContain('/rb-webcomponents/rb-webcomponents.umd.js"></script>');
      expect(code, 'the code is the dashboard tag').toContain(`<rb-dashboard\n  report-id="${reportId}"`);
      const token = /embed-token="([^"]+)"/.exec(code)?.[1];
      expect(token, 'the code carries an embed token').toBeTruthy();
      await page.locator('#btnCopyEmbedCode').click();
      expect(await page.evaluate(() => navigator.clipboard.readText()), 'the clipboard holds the code').toBe(code);

      // − the embed code is no share link: none was created.
      await expect(page.locator('#tableShareLinks [id^="shareLink-"]')).toHaveCount(0);
      await page.locator('#btnShareClose').click();

      // + pasted into a page of another site, opened by nobody signed in, it shows the dashboard: the
      // locked channel fixed, and its number the truth.
      portalContext = await page.context().browser()!.newContext();
      const portal = await portalContext.newPage();
      const portalUrl = 'http://localhost:8599/portal.html';
      await portal.route(portalUrl, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head><meta charset="utf-8"><title>Portal</title></head><body>\n${code}\n</body></html>`,
        }),
      );
      await portal.goto(portalUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect
        .poll(async () => bDigits(await portal.locator(`[id="widgetValue-${numberIds[0]}"]`).innerText().catch(() => '')), {
          timeout: 60_000,
          intervals: [500],
        })
        .toBe(String(truth));
      await expect(portal.locator('#channel'), 'the locked control cannot be changed').toBeDisabled({ timeout: 30_000 });

      // − the token answers this dashboard's data and nothing without it: the same call with no token is refused.
      const dataUrl = `${SERVER_URL}/api/reports/${reportId}/data?componentId=${encodeURIComponent(numberIds[0])}`;
      const withToken = await portalContext.request.get(dataUrl, { headers: { 'X-Embed-Token': token! } });
      expect(withToken.status(), 'the embed token opens the data door').toBe(200);
      const without = await portalContext.request.get(dataUrl, { maxRedirects: 0 });
      expect(without.status(), `no token, no data (${without.status()})`).not.toBe(200);
    });
  } finally {
    if (portalContext) await portalContext.close();
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M98 Text filters contains and ends with; the relative dates not yet tested', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M98 Contains and relative dates', async () => {
    // contains and ends with fold both sides to lower case and escape the LIKE wildcards
    // (`likeFilter` in sql-dialects.ts): LOWER(channel) LIKE LOWER('%app%') ESCAPE '!'.
    // The channels are marketplace 3723, mobile_app 4932, sales_rep 2176, web 13169 (24000 orders).
    const kpi = await eNewVisualWidget(page, 'orders');
    await addVisualFilter(page, 0, 'channel', 'contains', 'APP');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    // SELECT count(*) FROM dash_demo.orders WHERE lower(channel) LIKE '%app%'  -> 4932
    await g4ScalarIs(page, kpi, pCount((r) => r.channel.toLowerCase().includes('app')), 'contains, whatever the case');

    // + an underscore typed is an underscore, not LIKE's "any one character" (that would be all 24000).
    await page.locator('#inputFilterValue-0').fill('_');
    await runVisualQuery(page);
    // ... WHERE lower(channel) LIKE '%!_%' ESCAPE '!'  -> 7108 (mobile_app + sales_rep)
    const withUnderscore = pCount((r) => r.channel.includes('_'));
    expect(withUnderscore, 'some channels hold an underscore, not all').toBeLessThan(pCount(() => true));
    await g4ScalarIs(page, kpi, withUnderscore, 'contains _ keeps only the channels that hold one');

    // − a percent sign typed is a percent sign: no channel holds one.
    await page.locator('#inputFilterValue-0').fill('%');
    await runVisualQuery(page);
    // ... WHERE lower(channel) LIKE '%!%%' ESCAPE '!'  -> 0
    await g4ScalarIs(page, kpi, 0, 'contains % matches nothing');

    // + ends with, whatever the case.
    await page.locator('#selectFilterOp-0').selectOption('ends_with');
    await page.locator('#inputFilterValue-0').fill('EB');
    await runVisualQuery(page);
    // ... WHERE lower(channel) LIKE '%eb' ESCAPE '!'  -> 13169 (web)
    await g4ScalarIs(page, kpi, pCount((r) => r.channel.toLowerCase().endsWith('eb')), 'ends with, whatever the case');

    // − the start of a value is not its end: "mobile" begins mobile_app and ends nothing.
    await page.locator('#inputFilterValue-0').fill('mobile');
    await runVisualQuery(page);
    // ... WHERE lower(channel) LIKE '%mobile' ESCAPE '!'  -> 0
    expect(pCount((r) => r.channel.startsWith('mobile')), 'mobile begins some channel').toBeGreaterThan(0);
    await g4ScalarIs(page, kpi, pCount((r) => r.channel.toLowerCase().endsWith('mobile')), 'ends with mobile matches nothing');

    // − the filter taken away: every order again.
    await page.locator('#btnRemoveFilter-0').click();
    await runVisualQuery(page);
    // SELECT count(*) FROM dash_demo.orders  -> 24000
    await g4ScalarIs(page, kpi, pCount(() => true), 'no filter, every order');

    // The relative dates count from the data's today, 2026-09-30 here (M66), and take whole days
    // (`relativeDayRange` in relative-dates.ts): c >= DATE 'from' AND c < DATE 'the day after the last'.
    const day = (r: Record<string, string>): string => r.order_ts.slice(0, 10);
    const between = (from: string, to: string): number => pCount((r) => day(r) >= from && day(r) <= to);

    // + the last 2 weeks: the 14 days that end on the data's today.
    await addVisualFilter(page, 0, 'order_ts', 'last_n_weeks', '2');
    await runVisualQuery(page);
    // ... WHERE order_ts >= DATE '2026-09-17' AND order_ts < DATE '2026-10-01'  -> 451
    await g4ScalarIs(page, kpi, between('2026-09-17', '2026-09-30'), 'the last 2 weeks end on the data\'s today');

    // − a count that is not a whole number asks nothing: the filter is left out, every order is counted.
    await page.locator('#inputFilterValue-0').fill('1.5');
    await runVisualQuery(page);
    await g4ScalarIs(page, kpi, pCount(() => true), '1.5 weeks is not a period');

    // + the last 2 months: from the day after 2026-07-30 to the data's today.
    await page.locator('#selectFilterOp-0').selectOption('last_n_months');
    await page.locator('#inputFilterValue-0').fill('2');
    await runVisualQuery(page);
    // ... WHERE order_ts >= DATE '2026-07-31' AND order_ts < DATE '2026-10-01'  -> 1516
    await g4ScalarIs(page, kpi, between('2026-07-31', '2026-09-30'), 'the last 2 months end on the data\'s today');

    // + the periods take no value and are the calendar's own.
    const periods: Array<[string, string, string]> = [
      // ... WHERE order_ts >= DATE '2026-07-01' AND order_ts < DATE '2026-10-01'  -> 2351
      ['this_quarter', '2026-07-01', '2026-09-30'],
      // ... WHERE order_ts >= DATE '2026-08-01' AND order_ts < DATE '2026-09-01'  -> 551
      ['previous_month', '2026-08-01', '2026-08-31'],
      // ... WHERE order_ts >= DATE '2026-01-01' AND order_ts < DATE '2026-10-01'  -> 7253
      ['year_to_date', '2026-01-01', '2026-09-30'],
    ];
    for (const [operator, from, to] of periods) {
      await page.locator('#selectFilterOp-0').selectOption(operator);
      await expect(page.locator('#inputFilterValue-0'), `${operator} takes no value`).toHaveCount(0);
      await runVisualQuery(page);
      await g4ScalarIs(page, kpi, between(from, to), `${operator} counts from the data's today`);
    }
  });
});

test('(canvas mechanics) M99 Time buckets: day, quarter, year, day of week, hour of day, quarter of year, raw', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M99 Time buckets', async () => {
    // Orders per bucket of `order_ts`, counted in the frozen rows the demo database is seeded from
    // (`order_ts` is 'yyyy-mm-dd hh:mm:ss' there, the same instants DuckDB holds). The DuckDB forms are
    // `duckdbBucket` in sql-dialects.ts: strftime for day / quarter / year, and the integers of
    // dayofweek (Sunday = 0), hour and quarter. The truths, all of them adding up to the 24000 orders:
    //   SELECT strftime(order_ts, '%Y'), count(*) FROM dash_demo.orders GROUP BY 1
    //     -> 2024 7146, 2025 9601, 2026 7253
    //   SELECT strftime(order_ts, '%Y') || '-Q' || CAST(quarter(order_ts) AS VARCHAR), count(*) ... GROUP BY 1
    //     -> 11 groups, 2024-Q1 1271 ... 2026-Q3 2351
    //   SELECT CAST(quarter(order_ts) AS INTEGER), count(*) ... GROUP BY 1  -> 1 5226, 2 6263, 3 5662, 4 6849
    //   SELECT CAST(dayofweek(order_ts) AS INTEGER), count(*) ... GROUP BY 1
    //     -> 0 3222, 1 3965, 2 3618, 3 3445, 4 3404, 5 3437, 6 2909
    //   SELECT CAST(hour(order_ts) AS INTEGER), count(*) ... GROUP BY 1  -> 17 groups, 7 446 ... 23 708
    //   SELECT strftime(order_ts, '%Y-%m-%d'), count(*) ... GROUP BY 1  -> 1004 groups, 2026-09-30 31
    //   SELECT order_ts, count(*) ... GROUP BY 1  -> 23998 groups
    const per = (key: (ts: string) => string): Record<string, number> => {
      const n: Record<string, number> = {};
      for (const r of pOrders) {
        const k = key(r.order_ts);
        n[k] = (n[k] ?? 0) + 1;
      }
      return n;
    };
    const quarterOf = (ts: string): number => Math.floor((Number(ts.slice(5, 7)) - 1) / 3) + 1;
    const buckets: Array<[Parameters<typeof setTimeBucket>[2], Record<string, number>]> = [
      ['year', per((ts) => ts.slice(0, 4))],
      ['quarter', per((ts) => `${ts.slice(0, 4)}-Q${quarterOf(ts)}`)],
      ['quarter-of-year', per((ts) => String(quarterOf(ts)))],
      ['day-of-week', per((ts) => String(new Date(`${ts.slice(0, 10)}T00:00:00Z`).getUTCDay()))],
      ['hour-of-day', per((ts) => String(Number(ts.slice(11, 13))))],
      ['day', per((ts) => ts.slice(0, 10))],
    ];

    const id = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await addGroupBy(page, 'order_ts');
    // + Auto: the bucket is picked from the column's range, 2024-01-01 to 2026-09-30 (between two and
    //   ten years: a quarter, `guessTimeBucket`). Waiting for it also lets the range probe land before
    //   a bucket is picked by hand.
    await expect(page.locator('#selectTimeBucket-order_ts'), 'Auto picks a quarter for this range')
      .toHaveValue('quarter', { timeout: 20_000 });

    // − Raw timestamp: a group per instant, so the query stops at its limit (inputLimit's default 500).
    const queryLimit = 500;
    await setTimeBucket(page, 'order_ts', 'none');
    await runVisualQuery(page);
    expect(new Set(pOrders.map((r) => r.order_ts)).size, 'the instants are more than the limit lets through')
      .toBeGreaterThan(queryLimit);
    await expect(page.locator('#selectTimeBucket-order_ts')).toHaveValue('none');
    await expect(g4RowCount(page)).toContainText(`${queryLimit} rows returned`);

    // + every bucket: one row per group, each with its orders, adding up to every order. The days
    //   are more than 500, so the limit is raised first.
    await setVisualLimit(page, 2000);
    for (const [bucket, want] of buckets) {
      await setTimeBucket(page, 'order_ts', bucket);
      await runVisualQuery(page);
      // a handful of groups is drawn as a chart, and a chart keeps no rows to read: look at the table
      await switchToWidget(page, 'tabulator');
      const groups = Object.keys(want).length;
      const rows = await g4RowsWhere(page, id,
        (r) => r.length === groups && r.every((x) => want[String(x.order_ts)] !== undefined),
        `${bucket}: one row per group (${groups})`);
      const countKey = Object.keys(rows[0]).find((k) => k !== 'order_ts')!;
      const got: Record<string, number> = {};
      for (const r of rows) got[String(r.order_ts)] = Number(r[countKey]);
      expect(got, `${bucket}: the orders of each group`).toEqual(want);
      expect(Object.values(got).reduce((a, b) => a + b, 0), `${bucket}: the groups lose no order`).toBe(pOrders.length);
    }
  });
});

test('(canvas mechanics) M100 A date range chosen in the filter form, and its hint', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M100 Date range form', async (canvasId) => {
      // The demo data's today is 2026-09-30 (`dash_demo.as_of`): the presets count from it (M76).
      // Both days of a range are included.
      const day = (r: Record<string, string>): string => r.order_ts.slice(0, 10);
      const between = (from: string, to: string) => pCount((r) => day(r) >= from && day(r) <= to);
      const bar = page.locator('#formReportParameters');

      // − a range asked of a filter whose id names no first day: the form says how a range is made,
      //   adds no last day, and the bar draws the one date it is.
      await page.locator('#btnConfigureFilters').click();
      await page.locator('#btnAddParameter').waitFor({ state: 'visible', timeout: 5_000 });
      await page.locator('#btnAddParameter').click();
      await page.locator('#inputParamLabel-param1').fill('Period');
      await page.locator('#selectParamType-period').selectOption('Date');
      await expect(page.locator('#paramRangeHint-period'), 'no hint before a range is asked for').toHaveCount(0);
      await page.locator('#selectParamWidget-period').selectOption('daterange');
      await expect(page.locator('#paramRangeHint-period'), 'the form says what a range needs')
        .toContainText('ends in From (or _from)');
      await page.locator('#btnDoneFilters').click();
      await bar.waitFor({ state: 'visible', timeout: 10_000 });
      await expect.poll(async () => (await m65Params(page, canvasId)).period?.uiHints?.control,
        { message: 'the filter is saved as a range', timeout: 20_000, intervals: [500] }).toBe('daterange');
      expect(Object.keys(await m65Params(page, canvasId)), 'no last day was added').toEqual(['period']);
      await expect(bar.locator('#period'), 'drawn as one date').toHaveAttribute('type', 'date');
      await expect(bar.locator('#period_range'), 'and not as a range').toHaveCount(0);

      await page.locator('#btnConfigureFilters').click();
      await page.locator('#btnRemoveParam-period').click();
      await expect(page.locator('#paramRangeHint-period'), 'the hint goes with its filter').toHaveCount(0);

      // + a label that ends in "from" is slugged into a first day's id; asked for a range, the form adds
      //   its last day right after it, a Date of its own, and gives no hint.
      await page.locator('#btnAddParameter').click();
      await page.locator('#inputParamLabel-param1').fill('Order date from');
      await expect(page.locator('#inputParamId-order_date_from')).toHaveValue('order_date_from');
      await page.locator('#selectParamType-order_date_from').selectOption('Date');
      await page.locator('#selectParamWidget-order_date_from').selectOption('daterange');
      await expect(page.locator('#inputParamId-order_date_to'), 'the last day is added').toHaveValue('order_date_to');
      await expect(page.locator('#inputParamLabel-order_date_to')).toHaveValue('To');
      await expect(page.locator('#selectParamType-order_date_to')).toHaveValue('Date');
      await expect(page.locator('#paramRangeHint-order_date_from'), 'nothing to hint').toHaveCount(0);
      await page.locator('#inputParamDefault-order_date_from').fill('2026-01-02');
      await page.locator('#inputParamDefault-order_date_to').fill('2026-09-30');
      await page.locator('#btnDoneFilters').click();
      await bar.waitFor({ state: 'visible', timeout: 10_000 });
      await expect.poll(async () => (await m65Params(page, canvasId)).order_date_to?.defaultValue,
        { message: 'the last day\'s default is saved', timeout: 20_000, intervals: [500] }).toBe('2026-09-30');
      const params = await m65Params(page, canvasId);
      expect(Object.keys(params).sort(), 'the two days, and the removed filter gone').toEqual(['order_date_from', 'order_date_to']);
      expect(params.order_date_from).toMatchObject({ type: 'Date', defaultValue: '2026-01-02', uiHints: { control: 'daterange' } });
      expect(params.order_date_to).toMatchObject({ type: 'Date', label: 'To' });

      // + the bar draws one range control: both days inside it, presets, the defaults as Custom days.
      await expect(bar.locator('#order_date_from_range'), 'one range control').toBeVisible();
      await expect(bar.locator('#order_date_from_range #order_date_to'), 'the last day is inside the range').toBeVisible();
      await expect(bar.locator('label[for="order_date_to"]'), 'and not drawn again on its own').toHaveCount(0);
      await expect(bar.locator('#order_date_from')).toHaveValue('2026-01-02');
      await expect(bar.locator('#order_date_to')).toHaveValue('2026-09-30');
      await expect(bar.locator('#order_date_from_preset'), 'the defaults are days of the author\'s own').toHaveValue('');

      // + a count of orders between the two days, both ends bound.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addVisualFilter(page, 0, 'order_ts', 'between');
      await bindVisualFilterToParam(page, 0, 'order_date_from');
      await bindVisualFilterToParam(page, 0, 'order_date_to', 'valueTo');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      // SELECT count(*) FROM dash_demo.orders WHERE order_ts >= DATE '2026-01-02' AND order_ts < DATE '2026-10-01'  -> 7230
      await g4ScalarIs(page, kpi, between('2026-01-02', '2026-09-30'), 'the defaults: 2 January to the data\'s today');

      // + a preset fills both days at once, from the data's today, and the count follows.
      await bar.locator('#order_date_from_preset').selectOption('last_90_days');
      await expect(bar.locator('#order_date_from')).toHaveValue('2026-07-03');
      await expect(bar.locator('#order_date_to')).toHaveValue('2026-09-30');
      // ... WHERE order_ts >= DATE '2026-07-03' AND order_ts < DATE '2026-10-01'  -> 2297
      await g4ScalarIs(page, kpi, between('2026-07-03', '2026-09-30'), 'the last 90 days end on the data\'s today');

      // + published: the same range control, the defaults, and a preset from the same today.
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length;
      }, { message: 'the saved canvas holds the number widget', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubBar = page.locator('#parameterBarContainer');
      await expect(pubBar.locator('#order_date_from_range'), 'published, the same range control').toBeVisible({ timeout: 30_000 });
      await pPublishedNumberIs(page, ids.number[0], between('2026-01-02', '2026-09-30'), 'published, the defaults');
      await pubBar.locator('#order_date_from_preset').selectOption('this_month');
      await expect(pubBar.locator('#order_date_from')).toHaveValue('2026-09-01');
      await expect(pubBar.locator('#order_date_to')).toHaveValue('2026-09-30');
      await reloadDashboard(pubBar);
      // ... WHERE order_ts >= DATE '2026-09-01' AND order_ts < DATE '2026-10-01'  -> 938
      await pPublishedNumberIs(page, ids.number[0], between('2026-09-01', '2026-09-30'),
        'published, this month is the data\'s month');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M101 A cube answer by clicks: dimensions and measures ticked, a granularity picked, a segment applied', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M101 Cube by clicks', async () => {
    // The truths, from the frozen rows, in the words of the dd-delivery cube: Orders is every order,
    // Returned the ones with status 'returned', the segment arrived_late is
    // CAST(delivered_ts AS DATE) > promised_date, and OrderedAt is order_ts cut to its month, quarter or year.
    // On the seeded dash_demo (today 2026-09-30) the same numbers come from
    //   SELECT channel, count(*), count(*) FILTER (WHERE status = 'returned') FROM dash_demo.orders GROUP BY 1
    //     marketplace 3723 / 389, mobile_app 4932 / 265, sales_rep 2176 / 61, web 13169 / 717 (24000 / 1432 in all)
    //   the same WHERE CAST(delivered_ts AS DATE) > promised_date
    //     marketplace 222 / 26, mobile_app 298 / 11, sales_rep 139 / 3, web 898 / 42
    //   SELECT CAST(DATE_TRUNC('quarter', order_ts) AS DATE), count(*), count(*) FILTER (WHERE status = 'returned') ... GROUP BY 1
    //     11 quarters, 2024-01-01 1271 / 80 ... 2026-07-01 2351 / 144
    //   the same with 'year': 2024-01-01 7146 / 424, 2025-01-01 9601 / 558, 2026-01-01 7253 / 450
    //   SELECT count(DISTINCT DATE_TRUNC('month', order_ts)) FROM dash_demo.orders: 33
    // No dd-* demo cube declares a drill path (hierarchy), so no chk-hier-<h>-<level> box exists to tick here.
    const orders = frozenRows('orders');
    type Truth = Map<string, { orders: number; returned: number }>;
    const tally = (rows: Array<Record<string, string>>, keyOf: (o: Record<string, string>) => string): Truth => {
      const out: Truth = new Map();
      for (const o of rows) {
        const t = out.get(keyOf(o)) ?? { orders: 0, returned: 0 };
        t.orders += 1;
        if (o.status === 'returned') t.returned += 1;
        out.set(keyOf(o), t);
      }
      return out;
    };
    const late = orders.filter((o) => o.delivered_ts !== '' && o.delivered_ts.slice(0, 10) > o.promised_date);
    const byChannel = tally(orders, (o) => o.channel);
    const lateByChannel = tally(late, (o) => o.channel);
    const byMonth = tally(orders, (o) => `${o.order_ts.slice(0, 7)}-01`);
    const byQuarter = tally(orders, (o) =>
      `${o.order_ts.slice(0, 4)}-${String(Math.floor((Number(o.order_ts.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`);
    const byYear = tally(orders, (o) => `${o.order_ts.slice(0, 4)}-01-01`);
    const returnedInAll = orders.filter((o) => o.status === 'returned').length;

    // How a row of the answer is named: by its channel, or by the first day of its period (a DATE,
    // read as its yyyy-mm-dd whether it arrives as text or as a number of milliseconds).
    const channelOf = (r: Record<string, unknown>): string => String(r.Channel);
    const periodOf = (r: Record<string, unknown>): string => {
      const day = r.OrderedAt;
      return (typeof day === 'number' ? new Date(day).toISOString() : String(day)).slice(0, 10);
    };
    const answers = (rows: Array<Record<string, unknown>>, keyOf: (r: Record<string, unknown>) => string, truth: Truth): boolean =>
      rows.length === truth.size && rows.every((r) => 'Returned' in r
        && truth.get(keyOf(r))?.orders === Number(r.Orders) && truth.get(keyOf(r))?.returned === Number(r.Returned));
    const expectAnswer = (
      rows: Array<Record<string, unknown>>,
      keyOf: (r: Record<string, unknown>) => string,
      truth: Truth,
      what: string,
    ): void => {
      expect(rows.map(keyOf).sort(), `${what}: one row each`).toEqual([...truth.keys()].sort());
      for (const [key, want] of truth) {
        const row = rows.find((r) => keyOf(r) === key);
        expect(Number(row!.Orders), `${what} ${key}: orders`).toBe(want.orders);
        expect(Number(row!.Returned), `${what} ${key}: returned`).toBe(want.returned);
      }
    };
    const totalsOnly = (r: Array<Record<string, unknown>>): boolean =>
      r.length === 1 && 'Returned' in r[0] && Number(r[0].Orders) === orders.length && Number(r[0].Returned) === returnedInAll;

    const id = await eNewVisualWidget(page, 'orders');
    await pickVisualCube(page, 'dd-delivery');
    const cube = page.locator('#cubeQueryBuilderRenderer');
    await expect(cube.locator('#chk-meas-Orders'), 'the cube tree is drawn, nothing ticked').not.toBeChecked({ timeout: 15_000 });

    // + a measure ticked alone is one number: every order placed.
    await cube.locator('#chk-meas-Orders').check();
    await g4RowsWhere(page, id, (r) => r.length === 1 && Number(r[0].Orders) === orders.length, `one row: the ${orders.length} orders`);

    // + a dimension ticked beside it splits that number, one row per channel. The answer of a
    //   dimension and a measure draws itself as a chart; the rows are read off a table, picked once
    //   the answer is in (so the pick is not undone by the chart the answer chooses).
    await cube.locator('#chk-dim-Channel').check();
    await expect(g4RowCount(page), 'one row per channel').toContainText(`${byChannel.size} rows returned`, { timeout: 30_000 });
    await switchToWidget(page, 'tabulator');
    // + a second measure is a second column of the same rows.
    await cube.locator('#chk-meas-Returned').check();
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, channelOf, byChannel), 'orders and returned orders per channel'),
      channelOf, byChannel, 'per channel');

    // + a segment narrows every number to the orders that arrived late (its folder opens with a click).
    await cube.locator('#grp-filters').click();
    await cube.locator('#chk-seg-arrived_late').check();
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, channelOf, lateByChannel), 'only the late orders, per channel'),
      channelOf, lateByChannel, 'late, per channel');
    // − unticked, it narrows nothing: the totals come back.
    await cube.locator('#chk-seg-arrived_late').uncheck();
    await expect(cube.locator('#chk-seg-arrived_late')).not.toBeChecked();
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, channelOf, byChannel), 'every order again, per channel'),
      channelOf, byChannel, 'per channel again');

    // − the dimension unticked: one row of totals again, and a date not ticked has no grain to pick.
    await cube.locator('#chk-dim-Channel').uncheck();
    await g4RowsWhere(page, id, totalsOnly, 'one row of totals');
    await expect(cube.locator('#gran-OrderedAt'), 'no grain before the date is ticked').toHaveCount(0);

    // + a time dimension ticked asks for its month first.
    await cube.locator('#chk-dim-OrderedAt').check();
    await expect(cube.locator('#gran-OrderedAt'), 'a ticked date is read by month').toHaveValue('month');
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, periodOf, byMonth), `one row per month (${byMonth.size})`),
      periodOf, byMonth, 'per month');

    // + the grain picked as quarter: one row per quarter, each the sum of its months.
    await cube.locator('#gran-OrderedAt').selectOption('quarter');
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, periodOf, byQuarter), `one row per quarter (${byQuarter.size})`),
      periodOf, byQuarter, 'per quarter');

    // + and as year.
    await cube.locator('#gran-OrderedAt').selectOption('year');
    await expect(cube.locator('#gran-OrderedAt')).toHaveValue('year');
    expectAnswer(await g4RowsWhere(page, id, (r) => answers(r, periodOf, byYear), `one row per year (${byYear.size})`),
      periodOf, byYear, 'per year');

    // − the date unticked: its grain goes with it, and the answer is the totals again.
    await cube.locator('#chk-dim-OrderedAt').uncheck();
    await expect(cube.locator('#gran-OrderedAt')).toHaveCount(0);
    await g4RowsWhere(page, id, totalsOnly, 'one row of totals again');
  });
});

/**
 * The points a scatter draws, as Chart.js placed them on its two number axes (its own parsed x and y), each
 * as `x|y` to the cent, sorted. A point Chart.js could not place (an x that is no number) is not drawn and
 * not listed. Canvas: the locator is the chart itself (`widgetViz-<id>`); published: the chart's own box
 * (`widgetChart-<cid>`), inside the chart's shadow root.
 */
async function cScatterPoints(chart: Locator): Promise<{ type: string; points: string[] } | null> {
  if ((await chart.count()) === 0) return null;
  return chart.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (((el.getRootNode() as ShadowRoot).host ?? el) as any).getChartInstance?.();
    if (!instance) return null;
    const cents = (n: number) => Math.round(n * 100) / 100;
    const points: string[] = [];
    (instance.data.datasets ?? []).forEach((_: unknown, i: number) => {
      const parsed: Array<{ x: number; y: number }> = instance.getDatasetMeta(i)?._parsed ?? [];
      for (const p of parsed) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) points.push(`${cents(p.x)}|${cents(p.y)}`);
      }
    });
    return { type: String(instance.config.type), points: points.sort() };
  });
}

test('(canvas mechanics) M102 A scatter chart, in the Canvas and published', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M102 Scatter', async (canvasId) => {
      // One point per channel: its order total across, its shipping fees up. Summed in the seeded rows:
      //   SELECT channel, SUM(total_amount), SUM(shipping_fee) FROM dash_demo.orders GROUP BY channel;
      //   marketplace 10603243.77  770.61 | mobile_app 7039053.91  2480.79
      //   sales_rep   12058675.58  297.49 | web        36379909.08 3196.67
      const cents = (n: number) => Math.round(n * 100) / 100;
      const sumOf = (channel: string, field: string) =>
        pOrders.filter((r) => r.channel === channel).reduce((s, r) => s + Number(r[field]), 0);
      const pointsOf = (x: string, y: string) =>
        pChannels.map((c) => `${cents(sumOf(c, x))}|${cents(sumOf(c, y))}`).sort();
      const totalAcross = pointsOf('total_amount', 'shipping_fee');
      const shippingAcross = pointsOf('shipping_fee', 'total_amount');
      expect(totalAcross.length, 'a point per channel').toBe(4);
      const drawn = (want: string[]) => (s: { type: string; points: string[] } | null) =>
        !!s && s.type === 'scatter' && JSON.stringify(s.points) === JSON.stringify(want);
      // Both sums before the group, as M07 explains: the chart keeps the metrics of its first grouped answer.
      const chart = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'SUM', 'total_amount');
      await addAggregation(page, 1, 'SUM', 'shipping_fee');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'chart');
      await setChartType(page, 'scatter');

      // + X the order total, Y the shipping fees, picked in the chart's own pickers: one point per channel,
      //   at its two sums.
      await setChartAxes(page, { x: 'total_amount_sum', y: 'shipping_fee_sum' });
      await page.locator('#btnDisplayTab').click();
      await expect(page.locator('#btnChartType-scatter'), 'the chart is a scatter').toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#selectChartXAxis-0')).toHaveValue('total_amount_sum');
      await expect(page.locator('#selectChartYAxis-0')).toHaveValue('shipping_fee_sum');
      await expect(page.locator('#selectChartYAxis-1'), 'one measure up').toHaveCount(0);
      await expect.poll(async () => drawn(totalAcross)(await cScatterPoints(cViz(page, chart))),
        { message: 'the Canvas draws each channel at (total, shipping)', timeout: 30_000, intervals: [1_000] }).toBe(true);

      // - The pickers, not the order of the query, decide the axes: swapped, every point moves to
      //   (shipping, total) and none is left where it was.
      await setChartAxes(page, { x: 'shipping_fee_sum', y: 'total_amount_sum' });
      await expect.poll(async () => drawn(shippingAcross)(await cScatterPoints(cViz(page, chart))),
        { message: 'swapped, each channel is drawn at (shipping, total)', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const swapped = await cScatterPoints(cViz(page, chart));
      expect(swapped.points.filter((p) => totalAcross.includes(p)), 'no point is left at (total, shipping)').toEqual([]);

      // + Published, the scatter as it was saved: the same four points.
      let charts: string[] = [];
      await expect.poll(async () => (charts = (await getCanvasComponentIds(page, canvasId)).chart ?? []).length,
        { message: 'the saved canvas names the chart', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const stored = await eStoredWidgets(page, canvasId, (w) => {
        const dsl = w[0]?.displayConfig?.dslConfig ?? {};
        return dsl.type === 'scatter' && dsl.data?.labelField === 'shipping_fee_sum'
          && JSON.stringify((dsl.data?.datasets ?? []).map((d: { field?: string }) => d.field)) === '["total_amount_sum"]';
      });
      expect(stored[0].displayConfig.dslConfig.type, 'the canvas keeps the scatter').toBe('scatter');
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await expect.poll(async () => drawn(shippingAcross)(await cScatterPoints(page.locator(`[id="widgetChart-${charts[0]}"]`))),
        { message: 'the published scatter draws each channel at (shipping, total)', timeout: 60_000, intervals: [1_000] }).toBe(true);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/** One drawn cell of a highlighted column: the kind `rb-tabulator` marked it with ('' for none) and its colour. */
interface THighlightCell { kind: string; rgba: number[] }

/**
 * Every row a table draws (the totals row left out), keyed by its channel: the highlight its `field` cell
 * carries (`data-rb-highlight`, written by `shared/table-extras.ts`) and that cell's background as
 * [r, g, b, a], read off the page as a reader's browser paints it.
 */
async function tHighlightCells(table: Locator, field: string): Promise<Record<string, THighlightCell>> {
  const rows = await table.locator('.tabulator-row:not(.tabulator-calcs)').evaluateAll((els, f) => els.map((row) => {
    const cell = row.querySelector(`.tabulator-cell[tabulator-field="${f}"]`) as HTMLElement | null;
    const channel = (row.querySelector('.tabulator-cell[tabulator-field="channel"]') as HTMLElement | null)?.innerText.trim() ?? '';
    const colour = cell ? getComputedStyle(cell).backgroundColor : '';
    return { channel, kind: cell?.getAttribute('data-rb-highlight') ?? '', rgba: (colour.match(/[\d.]+/g) ?? []).map(Number) };
  }), field);
  const out: Record<string, THighlightCell> = {};
  for (const r of rows) out[r.channel] = { kind: r.kind, rgba: r.rgba };
  return out;
}

test('(canvas mechanics) M103 Table highlights: a colour scale, below a value in a chosen colour, and removed', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M103 Table highlights', async (canvasId) => {
      // The orders and their total per channel, counted in the seeded rows:
      //   SELECT channel, COUNT(order_id), SUM(total_amount) FROM dash_demo.orders GROUP BY channel;
      //   marketplace 3723 10603243.77 | mobile_app 4932 7039053.91 | sales_rep 2176 12058675.58 | web 13169 36379909.08
      const counts = pPerChannel();
      const totals: Record<string, number> = {};
      for (const r of pOrders) totals[r.channel] = (totals[r.channel] ?? 0) + Number(r.total_amount);
      // A colour scale (`highlightStyle` in shared/table-extras.ts): blue (80, 158, 227), from alpha 0.08 at
      // the smallest count (sales_rep) to 0.65 at the biggest (web), in proportion between.
      const low = Math.min(...pChannels.map((c) => counts[c]));
      const high = Math.max(...pChannels.map((c) => counts[c]));
      const alphaOf = (c: string) => 0.08 + 0.57 * (counts[c] - low) / (high - low);
      // "Below": a line just over the second smallest total (10603244), so two channels are under it.
      const line = Math.ceil(pChannels.map((c) => totals[c]).sort((a, b) => a - b)[1]);
      const under = pChannels.filter((c) => totals[c] < line);
      expect(under.sort(), 'marketplace and mobile_app are under the line').toEqual(['marketplace', 'mobile_app']);
      const rgbOf = (cell: THighlightCell | undefined) => (cell?.rgba ?? []).slice(0, 3).join(',');
      const alpha = (cell: THighlightCell | undefined) => (cell?.rgba.length === 4 ? cell.rgba[3] : 1);
      const scaled = (cells: Record<string, THighlightCell>) => pChannels.every((c) =>
        cells[c]?.kind === 'scale' && rgbOf(cells[c]) === '80,158,227' && Math.abs(alpha(cells[c]) - alphaOf(c)) <= 0.011);
      const belowIn = (rgb: string) => (cells: Record<string, THighlightCell>) => pChannels.every((c) => (under.includes(c)
        ? cells[c]?.kind === 'below' && rgbOf(cells[c]) === rgb && Math.abs(alpha(cells[c]) - 0.25) <= 0.011
        : cells[c]?.kind === ''));
      const unmarked = (cells: Record<string, THighlightCell>) =>
        pChannels.every((c) => cells[c] !== undefined && cells[c].kind === '');

      const table = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addAggregation(page, 1, 'SUM', 'total_amount');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      await pWaitRows(page, table, (rows) => rows.length === pChannels.length, 'a row per channel');
      const canvasTable = page.locator(`[id="widgetViz-${table}"]`);
      await page.locator('#btnDisplayTab').click();
      // - nothing is coloured before a highlight is picked.
      await expect.poll(async () => unmarked(await tHighlightCells(canvasTable, 'order_id_count')),
        { message: 'no highlight yet', timeout: 30_000, intervals: [1_000] }).toBe(true);

      // + a colour scale on the counts: every count coloured, the bigger the count the stronger the blue.
      await page.locator('#selectTableHighlightField').selectOption('order_id_count');
      await page.locator('#selectTableHighlightKind').selectOption('scale');
      await expect(page.locator('[id="tableHighlight-order_id_count"]')).toContainText('order_id_count: scale');
      await expect.poll(async () => scaled(await tHighlightCells(canvasTable, 'order_id_count')),
        { message: 'the Canvas colours each count by its size', timeout: 30_000, intervals: [1_000] }).toBe(true);

      // + "below" on the totals: only the two channels under the line, red until another colour is picked.
      await page.locator('#selectTableHighlightField').selectOption('total_amount_sum');
      await page.locator('#selectTableHighlightKind').selectOption('below');
      await page.locator('#inputTableHighlightValue').fill(String(line));
      await expect(page.locator('[id="tableHighlight-total_amount_sum"]')).toContainText(`total_amount_sum: below ${line}`);
      await expect.poll(async () => belowIn('220,38,38')(await tHighlightCells(canvasTable, 'total_amount_sum')),
        { message: 'the totals under the line, in red', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await page.locator('#selectTableHighlightColor').selectOption('green');
      await expect.poll(async () => belowIn('22,163,74')(await tHighlightCells(canvasTable, 'total_amount_sum')),
        { message: 'the same two totals, now in green', timeout: 30_000, intervals: [1_000] }).toBe(true);
      // - the scale on the counts is untouched by the second rule.
      expect(scaled(await tHighlightCells(canvasTable, 'order_id_count')), 'the counts keep their scale').toBe(true);

      // The two rules, as the canvas stores them.
      const both = [
        { field: 'order_id_count', kind: 'scale' },
        { field: 'total_amount_sum', kind: 'below', value: line, color: 'green' },
      ];
      const stored = await eStoredWidgets(page, canvasId,
        (w) => JSON.stringify(w[0]?.displayConfig?.dslConfig?.rbHighlights ?? []).includes('"green"'));
      expect(stored[0].displayConfig.dslConfig.rbHighlights, 'the stored rules').toEqual(both);

      // + Published: the same scale and the same two green totals.
      let tables: string[] = [];
      await expect.poll(async () => (tables = (await getCanvasComponentIds(page, canvasId)).tabulator ?? []).length,
        { message: 'the saved canvas names the table', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pub = page.locator(`[component-id="${tables[0]}"]`);
      await pWaitCells(page, tables[0], (cells) => cells.length === pChannels.length, 'the published rows');
      await expect.poll(async () => scaled(await tHighlightCells(pub, 'order_id_count')),
        { message: 'the published counts carry the scale', timeout: 60_000, intervals: [1_000] }).toBe(true);
      await expect.poll(async () => belowIn('22,163,74')(await tHighlightCells(pub, 'total_amount_sum')),
        { message: 'the published totals under the line, in green', timeout: 60_000, intervals: [1_000] }).toBe(true);

      // - Removed: the scale goes from the Canvas and from the stored rules, the other rule stays.
      await fReopenCanvas(page, canvasId, table);
      await fSelectWidget(page, table);
      await page.locator('#btnDisplayTab').click();
      await page.locator('[id="btnRemoveTableHighlight-order_id_count"]').click();
      await expect(page.locator('[id="tableHighlight-order_id_count"]'), 'the scale is no longer listed').toHaveCount(0);
      await expect.poll(async () => unmarked(await tHighlightCells(canvasTable, 'order_id_count')),
        { message: 'no count is coloured any more', timeout: 30_000, intervals: [1_000] }).toBe(true);
      await expect.poll(async () => belowIn('22,163,74')(await tHighlightCells(canvasTable, 'total_amount_sum')),
        { message: 'the green totals stay', timeout: 30_000, intervals: [1_000] }).toBe(true);
      let left = await eStoredWidgets(page, canvasId, (w) => (w[0]?.displayConfig?.dslConfig?.rbHighlights ?? []).length === 1);
      expect(left[0].displayConfig.dslConfig.rbHighlights, 'only the totals rule is stored').toEqual([both[1]]);

      // - and the last one: nothing coloured, and no rules stored at all.
      await page.locator('[id="btnRemoveTableHighlight-total_amount_sum"]').click();
      await expect.poll(async () => unmarked(await tHighlightCells(canvasTable, 'total_amount_sum')),
        { message: 'no total is coloured any more', timeout: 30_000, intervals: [1_000] }).toBe(true);
      left = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.dslConfig?.rbHighlights === undefined);
      expect(left[0].displayConfig.dslConfig.rbHighlights, 'the rules are gone from the canvas').toBeUndefined();

      // - Published again, the dashboard colours nothing either; its rows are all still there.
      const again = await publishDashboard(page);
      expect(again.reportId, 'publishing again keeps the report').toBe(reportId);
      await openPublished(page, reportId);
      await pWaitCells(page, tables[0], (cells) => cells.length === pChannels.length, 'the republished rows');
      await expect.poll(async () => {
        const counted = await tHighlightCells(pub, 'order_id_count');
        const summed = await tHighlightCells(pub, 'total_amount_sum');
        return unmarked(counted) && unmarked(summed);
      }, { message: 'the republished table colours nothing', timeout: 60_000, intervals: [1_000] }).toBe(true);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M104 A number tile shows the value field the author picks', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M104 Number value field', async (canvasId) => {
      // One answer, two measures, counted in the seeded rows:
      //   SELECT COUNT(order_id) AS order_id_count, SUM(qty) AS qty_sum FROM dash_demo.order_lines;  -> 59996, 140435
      const lines = frozenRows('order_lines');
      const lineCount = lines.filter((r) => r.order_id !== '').length;
      const units = lines.reduce((s, r) => s + Number(r.qty || 0), 0);
      expect(units, 'the two measures differ, so the tile can only show one of them').not.toBe(lineCount);
      const shown = (n: number) => n.toLocaleString('en-US');

      const tile = await eNewVisualWidget(page, 'order_lines');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addAggregation(page, 1, 'SUM', 'qty');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await clickDisplayTab(page);
      // A plain number, so what the tile writes is the value itself.
      await page.locator('#selectNumberFormat').selectOption('number');
      // As it comes: the first measure of the answer.
      await expect(page.locator(`#widgetViz-${tile}`), 'before a pick the tile shows the first measure')
        .toHaveText(shown(lineCount), { timeout: 30_000 });

      // + the second measure picked as the value field: the tile shows the units, not the line count.
      await page.locator('#selectNumberField').selectOption('qty_sum');
      await expect(page.locator(`#widgetViz-${tile}`), 'the Canvas shows the units')
        .toHaveText(shown(units), { timeout: 30_000 });

      // - picked back, the first measure shows again.
      await page.locator('#selectNumberField').selectOption('order_id_count');
      await expect(page.locator(`#widgetViz-${tile}`), 'picked back, the line count again')
        .toHaveText(shown(lineCount), { timeout: 30_000 });

      // + the units once more, stored, and published.
      await page.locator('#selectNumberField').selectOption('qty_sum');
      await expect(page.locator(`#widgetViz-${tile}`)).toHaveText(shown(units), { timeout: 30_000 });
      const stored = await eStoredWidgets(page, canvasId, (w) => w[0]?.displayConfig?.numberField === 'qty_sum');
      expect(stored[0].displayConfig.numberField, 'the canvas keeps the pick').toBe('qty_sum');
      let numbers: string[] = [];
      await expect.poll(async () => (numbers = (await getCanvasComponentIds(page, canvasId)).number ?? []).length,
        { message: 'the saved canvas names the tile', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await pPublishedNumberIs(page, numbers[0], units, 'the published tile shows the units, not the line count');
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

/**
 * The regions a map coloured with data (`rb-map` draws a region that has a row at fill opacity 0.85, one
 * without at 0.35), each with the number its tooltip gives, keyed by the region's name in the GeoJSON.
 * Read off the Leaflet map `rb-map` hands out (`getMapInstance`). Canvas: the locator is the map itself
 * (`widgetViz-<id>`); published: the map's own box (`widgetMap-<cid>`), inside the `rb-map` element.
 */
async function mColouredRegions(map: Locator): Promise<Record<string, number> | null> {
  if ((await map.count()) === 0) return null;
  return map.evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaflet = ((el.closest('rb-map') ?? el) as any).getMapInstance?.();
    if (!leaflet) return null;
    const out: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaflet.eachLayer((layer: any) => {
      if (!layer.feature || layer.options?.fillOpacity !== 0.85) return;
      const props = layer.feature.properties ?? {};
      const name = String(props.name ?? props.NAME ?? props.ADMIN ?? layer.feature.id ?? '');
      const tip = String(layer.getTooltip?.()?.getContent?.() ?? '');
      const value = tip.match(/:\s*([\d.,]+)\s*$/);
      out[name] = value ? Number(value[1].replace(/,/g, '')) : NaN;
    });
    return out;
  });
}

test('(canvas mechanics) M105 A map of US states', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;
  try {
    await withFreshCanvas(page, 'E2E mech M105 US states map', async (canvasId) => {
      // dash_demo has no US state column (its places are country codes, and geo_cities.region is
      // APAC / EMEA / LATAM / NA). The same shipped DuckDB connection carries Northwind Company at scale S
      // (schema northwind_co_s, loaded by AcademyDatasetsSeeder and checked against its checksums), whose
      // orders to the USA name their state in two letters, and to Canada their province:
      //   SELECT ShipRegion, COUNT(*) FROM northwind_co_s.Orders
      //   WHERE ShipCountry IN ('USA', 'Canada') GROUP BY ShipRegion ORDER BY ShipRegion;
      //   -> BC 117 | MA 62 | OR 904 | QC 302 | WA 236
      const STATES: Record<string, number> = { Massachusetts: 62, Oregon: 904, Washington: 236 };
      const US_SHAPES = 52; // public/geojson/us-states.geojson: the 50 states, DC and Puerto Rico
      const SQL = 'SELECT ShipRegion AS state, COUNT(*) AS orders FROM northwind_co_s.Orders\n'
        + "WHERE ShipCountry IN ('USA', 'Canada') GROUP BY ShipRegion ORDER BY ShipRegion";
      // Compared as sorted [name, number] pairs, whatever order the GeoJSON lists its regions in.
      const canonical = (o: Record<string, number> | null) =>
        (o ? JSON.stringify(Object.keys(o).sort().map((name) => [name, o[name]])) : 'no map yet');
      const coloured = async (map: Locator) => canonical(await mColouredRegions(map));

      await addTableToCanvas(page, 'dash_demo.orders');
      const mapId = await getLastWidgetId(page);
      await runSqlQuery(page, SQL);
      await expect(dRowCount(page), 'two provinces and three states').toContainText('5 rows returned', { timeout: 30_000 });
      await switchToWidget(page, 'map');

      // + Region "US states": the map is the 52 US shapes, and the three states the orders went to are
      //   coloured, each with its count; the two Canadian provinces colour nothing.
      await setMapConfig(page, { type: 'region', region: 'us_states', dimension: 'state', metric: 'orders' });
      await expect.poll(() => eMapShapes(page, mapId), { message: 'the US map, state by state', timeout: 60_000, intervals: [1_000] })
        .toBe(US_SHAPES);
      await expect.poll(() => coloured(page.locator(`[id="widgetViz-${mapId}"]`)),
        { message: 'MA, OR and WA coloured with their orders', timeout: 60_000, intervals: [1_000] })
        .toBe(canonical(STATES));

      // - Region "World countries": the same answer draws the world, and no US state is among what it colours.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#selectMapRegion').selectOption('world_countries');
      await expect.poll(() => eMapShapes(page, mapId), { message: 'the world map', timeout: 60_000, intervals: [1_000] })
        .toBeGreaterThan(US_SHAPES);
      const asCountries = await mColouredRegions(page.locator(`[id="widgetViz-${mapId}"]`));
      expect(Object.keys(asCountries ?? {}).filter((name) => name in STATES), 'no US state on a world map').toEqual([]);
      await page.locator('#selectMapRegion').selectOption('us_states');
      await expect.poll(() => eMapShapes(page, mapId), { timeout: 60_000, intervals: [1_000] }).toBe(US_SHAPES);

      // The region, the location and the metric, as the canvas stores them.
      const stored = await eStoredWidgets(page, canvasId,
        (w) => w[0]?.type === 'map' && w[0]?.displayConfig?.region === 'us_states' && w[0]?.displayConfig?.metric === 'orders');
      expect(stored[0].displayConfig).toMatchObject({ mapType: 'region', region: 'us_states', dimension: 'state', metric: 'orders' });

      // + Published: the same US map, the same three states with the same numbers.
      let maps: string[] = [];
      await expect.poll(async () => (maps = (await getCanvasComponentIds(page, canvasId)).map ?? []).length,
        { message: 'the saved canvas names the map', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubMap = page.locator(`[id="widgetMap-${maps[0]}"]`);
      await expect.poll(() => eMapShapes(page, maps[0]), { message: 'published, the US map', timeout: 60_000, intervals: [1_000] })
        .toBe(US_SHAPES);
      await expect.poll(() => coloured(pubMap),
        { message: 'published, MA, OR and WA coloured with their orders', timeout: 60_000, intervals: [1_000] })
        .toBe(canonical(STATES));
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M106 A slicer picking one value at a time, with its label, order, counts and a cap on its values', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;

  // The truths, counted in the frozen rows the seed loads (`pOrders`), never typed in. With the data
  // seeded for 2026-09-30 they are:
  //   SELECT channel, COUNT(*) FROM dash_demo.orders GROUP BY channel ORDER BY 2 DESC
  //     -> web 13169, mobile_app 4932, marketplace 3723, sales_rep 2176   (24000 in all)
  const perChannel: Record<string, number> = Object.fromEntries(
    pChannels.map((c) => [c, pCount((r) => r.channel === c)]));
  // "Alphabetical ↑" is the channels as text: marketplace, mobile_app, sales_rep, web.
  const alphabetical = [...pChannels].sort((a, b) => a.localeCompare(b));
  // "Count (most first)": web, mobile_app, marketplace, sales_rep.
  const byCount = [...pChannels].sort((a, b) => perChannel[b] - perChannel[a]);
  // The values a slicer draws, in the order it draws them, read off their own ids (`slicerValue-<slicer>-<value>`).
  const drawn = async (slicer: string): Promise<string[]> =>
    page.locator(`[id^="slicerValue-${slicer}-"]`).evaluateAll(
      (els, prefix) => els.map((el) => el.id.slice(prefix.length)), `slicerValue-${slicer}-`);
  // The count a value carries next to it: the digits of its button (a channel's name has none).
  const countOf = async (slicer: string, value: string): Promise<string> => bDigits(await pValue(page, slicer, value).innerText());

  try {
    await withFreshCanvas(page, 'E2E mech M106 Single-pick slicer', async (canvasId) => {
      // A KPI of the orders, then a slicer on their channel: the slicer is the widget the panel shows.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');
      const slicer = await addSlicer(page, 'orders', 'channel');
      const box = page.locator(`[id="slicer-${slicer}"]`);
      const footer = page.locator(`[id="slicerCount-${slicer}"]`);
      await expect(pValue(page, slicer, 'web'), 'the slicer lists the channels').toBeVisible({ timeout: 30_000 });

      // ── The label ─────────────────────────────────────────────────────────
      // − with no label typed the slicer is headed by its field.
      await expect(box, 'no label yet: no custom heading').not.toContainText('Sales channel');
      // + the label typed is the slicer's heading.
      await page.locator('#inputSlicerLabel').fill('Sales channel');
      await expect(box, 'the slicer is headed by the label typed').toContainText('Sales channel', { timeout: 15_000 });

      // ── The cap on its values, and the footer that counts them ────────────
      await expect(footer, 'the footer counts every channel').toHaveText(`${pChannels.length} values`);
      await page.locator('#selectSlicerSort').selectOption('asc');
      await page.locator('#inputSlicerMaxValues').fill('2');
      // + a cap of 2 keeps the first two in the slicer's own order, and the footer says 2.
      await expect(footer, 'the footer counts what the cap leaves').toHaveText('2 values', { timeout: 15_000 });
      await expect.poll(async () => drawn(slicer), { message: 'the first two channels as text', timeout: 15_000 })
        .toEqual(alphabetical.slice(0, 2));
      // − what the cap cut is not on the list at all (not greyed: gone).
      for (const cut of alphabetical.slice(2)) {
        await expect(pValue(page, slicer, cut), `${cut} is past the cap`).toHaveCount(0);
      }

      // ── One value at a time ───────────────────────────────────────────────
      const [first, second] = alphabetical.slice(0, 2); // marketplace, mobile_app
      await page.locator('#chkSlicerMultiSelect').uncheck();
      await pClick(page, slicer, first);
      await g4ScalarIs(page, kpi, perChannel[first], `the KPI counts the ${first} orders`);
      // + a second pick REPLACES the first: the KPI is the second value's orders alone, not the two summed.
      await pClick(page, slicer, second);
      await g4ScalarIs(page, kpi, perChannel[second], `a second pick replaces the first: the ${second} orders alone`);
      await expect(page.locator(`[id="btnRemoveSelection-channel-${second}"]`), 'one chip, for the value on').toBeVisible();
      await expect(page.locator(`[id="btnRemoveSelection-channel-${first}"]`), 'the first pick is gone').toHaveCount(0);
      await expect(pValue(page, slicer, first), 'and is no longer shown as picked').not.toHaveAttribute('data-state', 'selected');
      // − picking the value that is on drops it, so the reader can always get back to no filter.
      await pClick(page, slicer, second);
      await g4ScalarIs(page, kpi, pOrders.length, 'the same value again: every order');
      await expect(page.locator('#selectionBar'), 'nothing is picked').toHaveCount(0);

      // ── Sorted by count, with the counts shown ────────────────────────────
      await page.locator('#inputSlicerMaxValues').fill('1000');
      await expect(footer, 'the cap lifted: every channel').toHaveText(`${pChannels.length} values`, { timeout: 15_000 });
      // − counts are off by default: a value is its name alone.
      expect(await countOf(slicer, 'web'), 'no count while the box is unticked').toBe('');
      await page.locator('#selectSlicerSort').selectOption('count_desc');
      await page.locator('#chkSlicerShowCount').check();
      // + the most orders first: web, mobile_app, marketplace, sales_rep.
      await expect.poll(async () => drawn(slicer), { message: 'the channels with the most orders first', timeout: 15_000 })
        .toEqual(byCount);
      // + each value carries its own number of orders.
      for (const channel of pChannels) {
        await expect.poll(async () => countOf(slicer, channel), { message: `${channel} shows its orders`, timeout: 15_000 })
          .toBe(String(perChannel[channel]));
      }
      // + the cap now cuts by count: the three biggest channels stay.
      await page.locator('#inputSlicerMaxValues').fill('3');
      await expect(footer).toHaveText('3 values', { timeout: 15_000 });
      await expect.poll(async () => drawn(slicer), { message: 'the three biggest channels', timeout: 15_000 })
        .toEqual(byCount.slice(0, 3));

      // The saved slicer says all of it, the way the published one will read it.
      await expect.poll(async () => {
        const saved = (await getCanvasComponentIds(page, canvasId))['slicer'] ?? [];
        return saved.join(',');
      }, { message: 'the saved canvas names the slicer after its field', timeout: 30_000, intervals: [1_000] })
        .toMatch(/^slicer_channel_[^,]+$/);
      const ids = await getCanvasComponentIds(page, canvasId);
      const pubKpi = ids.number[0];
      const pubSlicer = ids['slicer'][0];

      // ── The same slicer, published ────────────────────────────────────────
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      const pubBox = page.locator(`[id="slicer-${pubSlicer}"]`);
      await expect(pValue(page, pubSlicer, 'mobile_app'), 'the published slicer lists its values')
        .toBeVisible({ timeout: 60_000 });
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'the published KPI counts every order');

      // + its label and its cap.
      await expect(pubBox, 'the published slicer has the label').toContainText('Sales channel');
      await expect(page.locator(`[id="slicerCount-${pubSlicer}"]`), 'and the cap of 3').toHaveText('3 values');

      // + one value at a time here too: the second pick replaces the first. (mobile_app and marketplace
      //   are among the three biggest channels, so both are on the list.)
      await pClick(page, pubSlicer, 'mobile_app');
      await pPublishedNumberIs(page, pubKpi, perChannel.mobile_app, 'the published KPI counts the mobile_app orders');
      await pClick(page, pubSlicer, 'marketplace');
      await pPublishedNumberIs(page, pubKpi, perChannel.marketplace, 'a second pick replaces the first');
      await expect(page.locator('[id="btnRemoveSelection-channel-marketplace"]'), 'one chip, for the value on').toBeVisible();
      await expect(page.locator('[id="btnRemoveSelection-channel-mobile_app"]'), 'the first pick is gone').toHaveCount(0);
      // − and the value that is on, picked again, drops it.
      await pClick(page, pubSlicer, 'marketplace');
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'every order again');
      await expect(page.locator('#selectionBar'), 'nothing is picked').toHaveCount(0);

      // + the order and the counts, as on the canvas.
      await expect.poll(async () => drawn(pubSlicer), { message: 'the published slicer: most orders first', timeout: 30_000 })
        .toEqual(byCount.slice(0, 3));
      for (const channel of byCount.slice(0, 3)) {
        await expect.poll(async () => countOf(pubSlicer, channel), { message: `published, ${channel} shows its orders`, timeout: 30_000 })
          .toBe(String(perChannel[channel]));
      }
      // − the channel the cap cut is not on the published list either.
      await expect(pValue(page, pubSlicer, byCount[3]), `${byCount[3]} is past the cap`).toHaveCount(0);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M107 A slicer\'s search box, height and code view', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

  // The truths, counted in the frozen rows the seed loads (`pOrders`), never typed in:
  //   SELECT COUNT(DISTINCT country_code) FROM dash_demo.orders                        -> 18
  //   SELECT DISTINCT country_code FROM dash_demo.orders WHERE lower(country_code) LIKE '%e%'
  //                                                                                   -> DE, ES, IE, SE
  //   SELECT COUNT(*) FROM dash_demo.orders WHERE device = 'tablet'                     -> 2392
  const countries = [...new Set(pOrders.map((r) => r.country_code))].filter((c) => c !== '').sort();
  const withE = countries.filter((c) => c.toLowerCase().includes('e'));
  const tablets = pCount((r) => r.device === 'tablet');
  expect(countries.length, 'more countries than the 10 a search box comes with by itself').toBeGreaterThan(10);
  expect(withE.length, 'some, not all, countries have an e').toBeGreaterThan(0);
  expect(withE.length).toBeLessThan(countries.length);

  /** The values a slicer draws, read off their own ids (`slicerValue-<slicer>-<value>`), sorted. */
  const drawn = async (slicer: string): Promise<string[]> =>
    (await page.locator(`[id^="slicerValue-${slicer}-"]`).evaluateAll(
      (els, prefix) => els.map((el) => el.id.slice(prefix.length)), `slicerValue-${slicer}-`)).sort();
  /** How tall the slicer's value list is drawn, and how tall its values would be uncut. */
  const listHeight = async (slicer: string): Promise<{ height: number; content: number }> =>
    page.locator(`[id="slicer-${slicer}"]`).evaluate((el) => {
      const list = el.querySelector('.slicer-list') as HTMLElement | null;
      return list
        ? { height: Math.round(list.getBoundingClientRect().height), content: list.scrollHeight }
        : { height: -1, content: -1 };
    });

  await withFreshCanvas(page, 'E2E mech M107 Slicer search height DSL', async (canvasId) => {
    const kpi = await eNewVisualWidget(page, 'orders');
    await addAggregation(page, 0, 'COUNT', 'order_id');
    await runVisualQuery(page);
    await switchToWidget(page, 'number');
    await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');

    const slicer = await addSlicer(page, 'orders', 'country_code');
    const search = page.locator(`[id="slicerSearch-${slicer}"]`);
    await expect(pValue(page, slicer, 'DE'), 'the slicer lists the countries').toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[id="slicerCount-${slicer}"]`), 'every country, counted')
      .toHaveText(`${countries.length} values`);

    // ── The search box ────────────────────────────────────────────────────
    // + "Auto" (the default) gives a long list its search box by itself.
    await expect(search, 'auto: more than 10 values come with a search box').toBeVisible();
    // − "Always off" takes it away, however long the list.
    await page.locator('#selectSlicerSearch').selectOption('off');
    await expect(search, 'off: no search box').toHaveCount(0, { timeout: 15_000 });
    // + "Always on" brings it back, and what is typed narrows the list to the values that hold it.
    await page.locator('#selectSlicerSearch').selectOption('on');
    await expect(search, 'on: the search box').toBeVisible({ timeout: 15_000 });
    await search.fill('e');
    await expect.poll(async () => drawn(slicer), { message: 'only the countries with an e', timeout: 15_000 })
      .toEqual(withE);
    await expect(pValue(page, slicer, 'US'), 'a country without one is not listed').toHaveCount(0);
    await expect(page.locator(`[id="slicerCount-${slicer}"]`), 'the search narrows the view, not the values')
      .toHaveText(`${countries.length} values`);
    // − an emptied box shows every value again.
    await search.fill('');
    await expect.poll(async () => drawn(slicer), { message: 'every country again', timeout: 15_000 })
      .toEqual(countries);

    // ── The height ────────────────────────────────────────────────────────
    // + "Auto" grows with the values up to 300 px: 18 countries are taller, so the list stops at 300.
    await expect.poll(async () => (await listHeight(slicer)).height, { message: 'auto: the list stops at 300 px', timeout: 15_000 })
      .toBe(300);
    expect((await listHeight(slicer)).content, 'the values are taller than the list').toBeGreaterThan(300);
    // + "Fixed" gives the list the height in the box next to it, 240 px until it is changed.
    await page.locator('#btnSlicerHeightFixed').click();
    await expect.poll(async () => (await listHeight(slicer)).height, { message: 'fixed: 240 px', timeout: 15_000 })
      .toBe(240);
    await expect.poll(async () => (await cStoredWidget(page, canvasId, slicer))?.displayConfig?.dslConfig?.height,
      { message: 'the canvas keeps the fixed height', timeout: 30_000, intervals: [1_000] }).toBe('240px');
    // − back to "Auto": the fixed height goes with it.
    await page.locator('#btnSlicerHeightAuto').click();
    await expect.poll(async () => (await listHeight(slicer)).height, { message: 'auto again: 300 px', timeout: 15_000 })
      .toBe(300);

    // ── The code view ─────────────────────────────────────────────────────
    // + the slicer's settings, written as code: its field among them.
    await openDslEditor(page);
    await expect(page.locator('#dslEditorInput'), 'the code names the field')
      .toContainText("field 'country_code'", { timeout: 15_000 });
    // + the code is the setting: written by hand, it gives the slicer another field and a label.
    await page.locator('#dslEditorInput').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText("slicer {\n  field 'device'\n  label 'Device'\n}\n");
    await page.waitForTimeout(3_000);
    await expect(page.locator('#selectSlicerField'), 'the field picker follows the code').toHaveValue('device', { timeout: 15_000 });
    await expect(page.locator('#inputSlicerLabel'), 'and so does the label box').toHaveValue('Device');
    await expect(page.locator(`[id="slicer-${slicer}"]`), 'the slicer is headed by the new label')
      .toContainText('Device', { timeout: 15_000 });
    await expect.poll(async () => drawn(slicer), { message: 'the slicer lists the devices now', timeout: 30_000 })
      .toEqual(pDevices);
    await expect(pValue(page, slicer, 'DE'), 'and no country any more').toHaveCount(0);
    // − what the code no longer says is back to its default: three devices are too few for a search box.
    await expect(search, 'no search box for three values').toHaveCount(0);
    // + and the new field filters: a tablet pick counts the tablet orders.
    await pClick(page, slicer, 'tablet');
    await g4ScalarIs(page, kpi, tablets, 'the KPI counts the orders made on a tablet');
    await expect(page.locator('[id="btnRemoveSelection-device-tablet"]'), 'the chip names the new field').toBeVisible();
    await pClick(page, slicer, 'tablet');
    await g4ScalarIs(page, kpi, pOrders.length, 'dropped again: every order');
  });
});

/**
 * Click the region a country code names on a map (`widgetMap-<id>`: the widget id on the Canvas, the
 * component id published - the same box either way).
 *
 * `rb-map` draws its regions on one canvas (`preferCanvas`), so there is no element per country to
 * find by id. The map itself is asked where that country's shape is (its feature carries the code,
 * under one of the keys `rb-map` reads a world map by), and the mouse is clicked in the middle of
 * it, the way pClickBar clicks a bar. Polled, because a published tile is replaced by a copy of itself
 * whenever the selections change, and the copy draws its map again from scratch.
 */
async function m108ClickRegion(page: Page, mapId: string, code: string): Promise<void> {
  const box = () => page.locator(`[id="widgetMap-${mapId}"]`);
  let at: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      if ((await box().count()) === 0) return false;
      await box().scrollIntoViewIfNeeded().catch(() => {});
      at = await box().evaluate((el, wanted) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = ((el.closest('rb-map') ?? el) as any).getMapInstance?.();
        if (!map) return null;
        const keys = ['ISO3166-1-Alpha-2', 'ISO_A2', 'iso_a2', 'ISO2', 'A2'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let region: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.eachLayer((layer: any) => {
          const feature = layer.feature;
          if (region || !feature || typeof layer.getBounds !== 'function') return;
          const names = [feature.id, ...keys.map((k) => feature.properties?.[k])]
            .map((v) => String(v ?? '').toUpperCase());
          if (names.includes(wanted)) region = layer;
        });
        if (!region) return null;
        const middle = region.getBounds().getCenter();
        const rect = map.getContainer().getBoundingClientRect();
        const outside = (p: { x: number; y: number }) => p.x < 0 || p.y < 0 || p.x > rect.width || p.y > rect.height;
        // A box too wide and short for every country with orders frames where most of them are
        // (Europe); a reader drags the map to the country, and so does the test.
        if (outside(map.latLngToContainerPoint(middle))) map.panTo(middle, { animate: false });
        const point = map.latLngToContainerPoint(middle);
        if (outside(point)) return null;
        return { x: rect.x + point.x, y: rect.y + point.y };
      }, code);
      return at !== null;
    }, { message: `the map draws ${code}`, timeout: 60_000, intervals: [1_000] })
    .toBe(true);
  await page.mouse.click(at!.x, at!.y);
  await page.waitForTimeout(500);
}

// Indented like its neighbours M56-M97 (at the describe's own level, column 0).

test('(canvas mechanics) M108 A table row and a map region filter the dashboard, and one chip is taken off', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;

  // The truths, counted in the frozen rows the seed loads (`pOrders`), never typed in:
  //   SELECT COUNT(*) FROM dash_demo.orders WHERE channel = 'web'                        -> 13169
  //   SELECT COUNT(*) FROM dash_demo.orders WHERE country_code = 'BR'                    -> 987
  //   SELECT COUNT(*) FROM dash_demo.orders WHERE channel = 'web' AND country_code = 'BR' -> 542
  //   SELECT channel, COUNT(*) FROM dash_demo.orders WHERE country_code = 'BR' GROUP BY 1
  //     -> marketplace 140, mobile_app 196, sales_rep 109, web 542
  // Brazil, because its shape is large and its middle is inside it, so a click there lands on it.
  const COUNTRY = 'BR';
  const web = (r: Record<string, string>) => r.channel === 'web';
  const inCountry = (r: Record<string, string>) => r.country_code === COUNTRY;
  const webCount = pCount(web);
  const countryCount = pCount(inCountry);
  const bothCount = pCount((r) => web(r) && inCountry(r));
  const countryPerChannel: Record<string, number> = {};
  for (const r of pOrders) if (inCountry(r)) countryPerChannel[r.channel] = (countryPerChannel[r.channel] ?? 0) + 1;
  expect(bothCount, 'web orders were shipped to the country').toBeGreaterThan(0);

  try {
    await withFreshCanvas(page, 'E2E mech M108 Table and map clicks', async (canvasId) => {
      // A KPI to be filtered; a table of the orders per channel and a map of them per country, both
      // built in the Visual tab on the same table, so a click on either reaches the other and the KPI.
      const kpi = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await runVisualQuery(page);
      await switchToWidget(page, 'number');
      await g4ScalarIs(page, kpi, pOrders.length, 'the KPI counts every order');

      const table = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'channel');
      await runVisualQuery(page);
      await switchToWidget(page, 'tabulator');
      await pWaitRows(page, table, (rows) => rows.length === pChannels.length, 'a row per channel');
      await setClicksFilter(page, 'table', true);

      const map = await eNewVisualWidget(page, 'orders');
      await addAggregation(page, 0, 'COUNT', 'order_id');
      await addGroupBy(page, 'country_code');
      await runVisualQuery(page);
      await switchToWidget(page, 'map');
      await setMapConfig(page, {
        type: 'region', region: 'world_countries', dimension: 'country_code', metric: 'order_id_count',
      });
      await expect.poll(() => eMapShapes(page, map), { message: 'the map draws its countries', timeout: 60_000, intervals: [1_000] })
        .toBeGreaterThan(0);

      // − a map whose box is unticked selects nothing when a country is clicked.
      await m108ClickRegion(page, map, COUNTRY);
      await expect(page.locator('#selectionBar'), 'an unticked map selects nothing').toHaveCount(0);
      await g4ScalarIs(page, kpi, pOrders.length, 'and the KPI still counts every order');
      await setClicksFilter(page, 'map', true);

      // + a click on the table's web row selects web: the KPI counts the web orders.
      const canvasCell = page.locator(`[id^="tabCell-${table}-"][id$="-channel"]`, { hasText: /^\s*web\s*$/ }).first();
      await expect(canvasCell, 'the table draws a web row').toBeVisible({ timeout: 30_000 });
      await canvasCell.click();
      await g4ScalarIs(page, kpi, webCount, 'a table row: the web orders');
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'a chip for the row clicked').toBeVisible();
      // − the table is not filtered by its own clicks: every channel is still there to click.
      await pWaitRows(page, table, (rows) => rows.length === pChannels.length, 'the clicked table keeps every channel');

      // + a click on the country ANDs with the row: the web orders of that country.
      await m108ClickRegion(page, map, COUNTRY);
      await g4ScalarIs(page, kpi, bothCount, `a region too: the web orders of ${COUNTRY}`);
      await expect(page.locator(`[id="btnRemoveSelection-country_code-${COUNTRY}"]`), 'a chip for the country').toBeVisible();
      // + and the table answers for that country, channel by channel.
      await pWaitRows(page, table,
        (rows) => rows.length === Object.keys(countryPerChannel).length
          && rows.every((r) => Number(r.order_id_count) === countryPerChannel[String(r.channel)]),
        `the table counts the orders of ${COUNTRY} per channel`);

      // + one chip taken off drops that selection alone: the country's orders, every channel.
      await page.locator('[id="btnRemoveSelection-channel-web"]').click();
      await g4ScalarIs(page, kpi, countryCount, `the row's chip off: every order of ${COUNTRY}`);
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'that chip is gone').toHaveCount(0);
      await expect(page.locator(`[id="btnRemoveSelection-country_code-${COUNTRY}"]`), 'the other one stays').toBeVisible();
      // − and the last chip off leaves nothing selected.
      await page.locator(`[id="btnRemoveSelection-country_code-${COUNTRY}"]`).click();
      await g4ScalarIs(page, kpi, pOrders.length, 'no chip: every order');
      await expect(page.locator('#selectionBar')).toHaveCount(0);

      // ── The same clicks, on the published page ─────────────────────────────
      let ids: Record<string, string[]> = {};
      await expect.poll(async () => {
        ids = await getCanvasComponentIds(page, canvasId);
        return (ids.number ?? []).length === 1 && (ids.tabulator ?? []).length === 1 && (ids.map ?? []).length === 1;
      }, { message: 'the saved canvas names the KPI, the table and the map', timeout: 30_000, intervals: [1_000] }).toBe(true);
      const pubKpi = ids.number[0];
      const pubTable = ids.tabulator[0];
      const pubMap = ids.map[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      await openPublished(page, reportId);
      await pPublishedNumberIs(page, pubKpi, pOrders.length, 'the published KPI counts every order');
      await pWaitCells(page, pubTable, (cells) => cells.length === pChannels.length, 'the published table has a row per channel');

      // + the web row: the web orders.
      const pubCell = page.locator(`[id^="tabCell-${pubTable}-"][id$="-channel"]`, { hasText: /^\s*web\s*$/ }).first();
      await expect(pubCell, 'the published table draws a web row').toBeVisible({ timeout: 30_000 });
      await pubCell.click();
      await pPublishedNumberIs(page, pubKpi, webCount, 'published, a table row: the web orders');
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'its chip').toBeVisible();

      // + the country too: the web orders of that country, and the table per channel for it.
      await m108ClickRegion(page, pubMap, COUNTRY);
      await pPublishedNumberIs(page, pubKpi, bothCount, `published, a region too: the web orders of ${COUNTRY}`);
      await expect(page.locator(`[id="btnRemoveSelection-country_code-${COUNTRY}"]`), 'its chip').toBeVisible();
      await pWaitCells(page, pubTable,
        (cells) => cells.length === Object.keys(countryPerChannel).length
          && cells.every((row) => bDigits(row[1] ?? '') === String(countryPerChannel[row[0]])),
        `the published table counts the orders of ${COUNTRY} per channel`);

      // + one chip off: the country's orders; the country's chip stays.
      await page.locator('[id="btnRemoveSelection-channel-web"]').click();
      await pPublishedNumberIs(page, pubKpi, countryCount, `published, the row's chip off: every order of ${COUNTRY}`);
      await expect(page.locator('[id="btnRemoveSelection-channel-web"]'), 'that chip is gone').toHaveCount(0);
      await expect(page.locator(`[id="btnRemoveSelection-country_code-${COUNTRY}"]`), 'the other one stays').toBeVisible();
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

test('(canvas mechanics) M109 A viewer sorts and pages a published table; Unpublish can be called off', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  let reportId: string | undefined;

  // The truths, read off the frozen rows the seed loads (`frozenRows('products')`), never typed in.
  // unit_cost has 200 different values for 200 products, so every order of it is one order:
  //   SELECT MIN(unit_cost), MAX(unit_cost) FROM dash_demo.products                      -> 10.16, 1554.16
  //   SELECT product_id FROM dash_demo.products ORDER BY unit_cost DESC LIMIT 10 OFFSET 10
  //     -> 5095, 5076, 5091, 5079, 5086, 5118, 5115, 5109, 5101, 5105   (rows 11-20, the second page)
  const products = frozenRows('products');
  const byCostDesc = [...products].sort((a, b) => Number(b.unit_cost) - Number(a.unit_cost));
  expect(new Set(products.map((p) => p.unit_cost)).size, 'no two products cost the same').toBe(products.length);
  const cheapest = Number(byCostDesc[byCostDesc.length - 1].unit_cost);
  const dearest = Number(byCostDesc[0].unit_cost);
  const PAGE = 10;
  const firstPage = byCostDesc.slice(0, PAGE).map((p) => p.product_id);
  const secondPage = byCostDesc.slice(PAGE, 2 * PAGE).map((p) => p.product_id);

  try {
    await withFreshCanvas(page, 'E2E mech M109 Viewer sorts and pages', async (canvasId) => {
      // Every product, in a table of 10 rows a page.
      await addTableToCanvas(page, 'dash_demo.products');
      await switchToWidget(page, 'tabulator');
      await setTabulatorOptions(page, { pagination: true, pageSize: PAGE });

      let tables: string[] = [];
      await expect.poll(async () => (tables = (await getCanvasComponentIds(page, canvasId)).tabulator ?? []).length,
        { message: 'the saved canvas names the table', timeout: 30_000, intervals: [1_000] }).toBe(1);
      const table = tables[0];
      const published = await publishDashboard(page);
      reportId = published.reportId;
      const link = await createPlainShareLink(page);
      expect(await shareLinkStatus(page, link), 'the published dashboard answers').toBe(200);

      // ── Unpublish, called off ─────────────────────────────────────────────
      // + the dialog says what would go, and Cancel leaves everything as it was.
      await page.locator('#btnUnpublishDashboard').click();
      const dialog = page.locator('#dlgUnpublishDashboard');
      await expect(dialog, 'Unpublish asks first').toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#txtUnpublishConsequences'), 'and names the dashboard')
        .toContainText(`/dashboard/${reportId}`);
      // − a click inside the dialog is not a click on its backdrop: it stays open.
      await page.locator('#txtUnpublishConsequences').click();
      await expect(dialog, 'a click on the question keeps it open').toBeVisible();
      await page.locator('#btnCancelUnpublish').click();
      await expect(dialog, 'Cancel closes it').toHaveCount(0);
      await expect(page.locator('#btnUnpublishDashboard'), 'the dashboard is still there to unpublish').toBeVisible();
      expect(await shareLinkStatus(page, link), 'after Cancel the dashboard still answers').toBe(200);
      // + a click on the backdrop closes it the same way, and takes nothing down either.
      await page.locator('#btnUnpublishDashboard').click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await page.locator('#overlayUnpublishDashboard').click({ position: { x: 5, y: 5 } });
      await expect(dialog, 'the backdrop closes it').toHaveCount(0);
      await expect(page.locator('#btnShareDashboard'), 'the dashboard can still be shared').toBeVisible();
      expect(await shareLinkStatus(page, link), 'after the backdrop the dashboard still answers').toBe(200);

      // ── A viewer sorts and pages the published table ──────────────────────
      await openPublished(page, reportId);
      await pWaitCells(page, table, (cells) => cells.length === PAGE, `the published table shows ${PAGE} rows a page`);
      const pub = page.locator(`[component-id="${table}"]`);
      // The column's header: Tabulator draws it without an id of its own (M88 reaches it the same way).
      const costHeader = pub.locator('.tabulator-col[tabulator-field="unit_cost"]');
      /** The product ids of the rows the table draws now, top to bottom. */
      const drawnIds = async (): Promise<string[]> =>
        (await page.locator(`[id^="tabCell-${table}-"][id$="-product_id"]`).allInnerTexts()).map((t) => bDigits(t));

      // + a click on the header sorts by it, cheapest first.
      await costHeader.click();
      await expect.poll(async () => cFirstRowCell(page, table, 'unit_cost'),
        { message: 'one click: the cheapest product first', timeout: 30_000, intervals: [1_000] }).toBeCloseTo(cheapest, 2);
      // + a second click turns the order round: the dearest first, then the next nine.
      await costHeader.click();
      await expect.poll(async () => cFirstRowCell(page, table, 'unit_cost'),
        { message: 'a second click: the dearest product first', timeout: 30_000, intervals: [1_000] }).toBeCloseTo(dearest, 2);
      await expect.poll(drawnIds, { message: 'page 1 is the ten dearest products', timeout: 30_000, intervals: [1_000] })
        .toEqual(firstPage);
      // − the 11th dearest is not on page 1.
      expect(await drawnIds(), 'the 11th product waits for page 2').not.toContain(secondPage[0]);

      // + page 2 holds rows 11-20 of that same order.
      await page.locator(`[id="${table}_btnTabulatorPage-2"]`).click();
      await expect.poll(drawnIds, { message: 'page 2 is the 11th to the 20th dearest', timeout: 30_000, intervals: [1_000] })
        .toEqual(secondPage);
      expect(await drawnIds(), 'and none of page 1').not.toContain(firstPage[0]);
    });
  } finally {
    if (reportId) await deleteReportAsAdmin(reportId);
  }
});

});

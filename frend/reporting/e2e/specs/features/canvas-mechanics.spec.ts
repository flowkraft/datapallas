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
  setColumnTitle,
  setGaugeConfig,
  setGaugeField,
  setMapConfig,
  setNumberField,
  setProgressConfig,
  setSankeyFields,
  setTabulatorOptions,
  setTrendConfig,
  setVisualLimit,
  setWidgetDsl,
  switchToWidget,
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
  getCanvasComponentIds,
} from '../../helpers/dashboard-test-helper';
import {
  openPublished,
} from '../../helpers/dashboard-demos/published-dashboard-checks';
import {
  stateOf,
} from '../../helpers/dashboard-demos/canvas-parity';
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
  await page.locator('rb-parameters').first().waitFor({ state: 'visible', timeout: 10_000 });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pivot = el as any;
    const data = pivot.getPivotData?.();
    if (!data) return null;
    const rowKeys: string[][] = data.getRowKeys();
    const colKeys: string[][] = data.getColKeys();
    const cells: Record<string, number> = {};
    for (const r of rowKeys) for (const c of colKeys) cells[`${r.join('|')}::${c.join('|')}`] = Number(data.getAggregator(r, c).value());
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
  const chip = page.locator(`[id="btnDragPivotSource-${field}"], [id="btnDragPivotField-${field}"]`).first();
  const target = page.locator(`[id="pivotZone-${zone}"]`);
  await chip.waitFor({ state: 'visible', timeout: 10_000 });
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  const from = await chip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error(`cannot drag ${field} to ${zone}: a box is missing`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
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

/**
 * The text of a column's cell in the first row Tabulator drew. Tabulator draws its rows itself, so
 * this is the one place the test reaches a third-party class (`.tabulator-row`, `tabulator-field`);
 * it is a recorded exception of the id coverage table.
 */
async function cFirstRowCell(tabulator: Locator, field: string): Promise<number | null> {
  return tabulator.evaluate((el, f) => {
    const root: ParentNode = (el as HTMLElement).shadowRoot ?? el;
    const cell = root.querySelector(`.tabulator-row .tabulator-cell[tabulator-field="${f}"]`);
    if (!cell) return null;
    const n = Number((cell.textContent ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isNaN(n) ? null : n;
  }, field);
}

/** Replace the DSL in the Display tab's pane and stay there (no return to the Data tab). */
async function cTypeDslAndStay(page: Page, dsl: string): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(500);
  await openDslEditor(page);
  const editor = page.locator('#dslEditorContainer .cm-content');
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
  field: string,
  settings: { title: string; viewAs: string; decimals: number },
): Promise<void> {
  const gear = page.locator(`[id="btnColumnSettings-${field}"]`);
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

/** The rows the widget behind `#widget-<id>` was handed: the `data` of its rb-* element. */
async function eWidgetRows(page: Page, widgetId: string): Promise<Array<Record<string, unknown>>> {
  let rows: Array<Record<string, unknown>> = [];
  await expect
    .poll(
      async () => {
        rows = await page.evaluate((id) => {
          const widget = document.getElementById(`widget-${id}`);
          const viz = widget?.querySelector(
            'rb-value, rb-trend, rb-chart, rb-tabulator, rb-pivot-table, rb-map, rb-gauge, rb-progress',
          ) as (HTMLElement & { data?: unknown }) | null;
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

/** The colour the first dataset of the chart behind `#widget-<id>` is drawn with. */
async function eFirstDatasetColour(page: Page, widgetId: string): Promise<string> {
  const colour = await page.evaluate((id) => {
    const chart = document.getElementById(`widget-${id}`)?.querySelector('rb-chart') as
      (HTMLElement & { data?: { datasets?: Array<{ backgroundColor?: unknown }> } }) | null;
    const bg = chart?.data?.datasets?.[0]?.backgroundColor;
    return Array.isArray(bg) ? String(bg[0]) : String(bg ?? '');
  }, widgetId);
  return colour.toLowerCase();
}

/** Leaflet draws a region, a pin or a grid cell as one interactive path inside the widget's own box. */
async function eMapShapes(page: Page, widgetId: string): Promise<number> {
  return page.locator(`#widget-${widgetId} .leaflet-interactive`).count();
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

/** What the first `n`-th rb-tabulator on the page writes out, shadow DOM included. */
async function fTabulatorText(page: Page, nth: number): Promise<string> {
  const tile = page.locator('rb-tabulator').nth(nth);
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

/** The share-attribute rows' key (the suffix of their ids), in order. */
async function g1AttrKeys(page: Page): Promise<string[]> {
  const ids = await page.locator('[id^="shareAttrName-"]').evaluateAll((els) => els.map((e) => e.id));
  return ids.map((id) => id.substring('shareAttrName-'.length));
}

/** Add an attribute row and fill its name and value. Returns the row key. */
async function g1AddAttr(page: Page, name: string, value: string): Promise<string> {
  const before = await g1AttrKeys(page);
  await page.locator('#btnAddShareAttribute').click();
  await expect(page.locator('[id^="shareAttrName-"]')).toHaveCount(before.length + 1);
  const key = (await g1AttrKeys(page)).filter((k) => !before.includes(k))[0];
  await page.locator(`[id="shareAttrName-${key}"]`).fill(name);
  await page.locator(`[id="shareAttrValue-${key}"]`).fill(value);
  return key;
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

/** Wait until the first Tabulator on the page writes out text that matches. */
async function g2TableShows(page: Page, pattern: RegExp, message: string): Promise<void> {
  await expect.poll(() => fTabulatorText(page, 0), { message, timeout: 20_000 }).toMatch(pattern);
}

/** Wait until the first Tabulator on the page no longer writes out text that matches. */
async function g2TableLacks(page: Page, pattern: RegExp, message: string): Promise<void> {
  await expect.poll(() => fTabulatorText(page, 0), { message, timeout: 20_000 }).not.toMatch(pattern);
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
    const chart = (document.getElementById(`widget-${id}`)?.querySelector('rb-chart') as any)?.getChartInstance?.();
    const points: Array<{ r?: number }> = chart?.data?.datasets?.[0]?.data ?? [];
    return points.map((p) => Number(p.r));
  }, widgetId);
  return radii.sort((a, b) => a - b);
}

/** Whether the bars of a widget's chart stack, and how many series it draws. */
async function g4ChartStack(page: Page, widgetId: string): Promise<{ stacked: boolean; series: number }> {
  return page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (document.getElementById(`widget-${id}`)?.querySelector('rb-chart') as any)?.getChartInstance?.();
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
    const options = (document.getElementById(`widget-${id}`)?.querySelector('rb-sankey') as any)?.options;
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
  const pivot = page.locator('rb-pivot-table').first();
  await expect(pivot).toHaveAttribute('component-id', cid, { timeout: 60_000 });
  await expect(page.locator(`[id="widgetPivot-${cid}"]`), 'the published pivot is on the page').toBeVisible();
  await cWaitPivot(pivot, (x) => cSame(x.rowKeys, g5Statuses) && cSame(x.colKeys, g5Channels),
    'the published pivot counts orders per status and channel');
  return { reportId: published.reportId, pivot };
}

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
        await expect(reader.locator('rb-dashboard'), 'the link opens the dashboard with no sign-in')
          .toBeVisible({ timeout: 60_000 });
        await expect(reader.locator('#channel'), 'the locked control cannot be changed').toBeDisabled({ timeout: 30_000 });
        await expect(reader.locator('#channel_lockedNote')).toHaveText('Fixed by this link');
        await expect
          .poll(async () => bDigits(await reader!.locator('rb-value').first().innerText()), { timeout: 60_000, intervals: [500] })
          .toBe(String(truth));

        // And what the link carries is a credential that works for the data behind the tile.
        const token = new URL(url).searchParams.get('token')!;
        const dataUrl = `${SERVER_URL}/api/reports/${reportId}/data?componentId=${encodeURIComponent(numberIds[0])}`;
        const allowed = await readerContext.request.get(dataUrl, { headers: { 'X-Embed-Token': token } });
        expect(allowed.status(), 'the live link answers its data call').toBe(200);

        // Negative: revoke it, and the same link is refused.
        await page.locator('[id^="btnRevokeShareLink-"]').first().click();
        await expect(page.locator('#tableShareLinks [id^="shareLink-"]'), 'the revoked link leaves the table')
          .toHaveCount(0, { timeout: 15_000 });
        const refused = await readerContext.request.get(dataUrl, { headers: { 'X-Embed-Token': token } });
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
          .poll(async () => bDigits(await root.locator('rb-value').first().innerText()), { timeout: 60_000, intervals: [500] })
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
      await expect(page.locator('rb-pivot-table'), 'and no pivot is left').toHaveCount(0);

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
      await expect(page.locator('[id="btnTabulatorPage-2"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[id="btnTabulatorPage-3"]')).toBeVisible();

      // + 100 per page: 200 products are exactly two pages (the pager has no page 3).
      await setTabulatorOptions(page, { pageSize: 100 });
      await expect.poll(async () => (await cReadTabulator(page, id)).options.paginationSize, { timeout: 15_000 }).toBe(100);
      await expect(page.locator('[id="btnTabulatorPage-2"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[id="btnTabulatorPage-3"]')).toHaveCount(0);

      // − pagination off: no pager at all, and the table holds every product.
      await setTabulatorOptions(page, { pagination: false });
      await expect.poll(async () => (await cReadTabulator(page, id)).options.pagination, { timeout: 15_000 }).toBe(false);
      await expect(page.locator('[id="btnTabulatorPage-2"]')).toHaveCount(0);
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
        await expect(page.locator('#dslExampleContainer .cm-content')).toContainText('tabulator', { timeout: 15_000 });
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
          .poll(async () => cFirstRowCell(cViz(page, tabId), 'list_price'), { message: 'the Canvas draws the dearest product first', timeout: 20_000 })
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
        const published = await publishDashboard(page);
        reportId = published.reportId;
        await openPublished(page, published.reportId);
        const publishedTable = page.locator('rb-tabulator').first();
        await expect(publishedTable).toBeVisible({ timeout: 60_000 });
        await expect
          .poll(async () => cFirstRowCell(publishedTable, 'list_price'), { message: 'the published table sorts the same way', timeout: 60_000 })
          .toBeCloseTo(dearest, 2);
        await cWaitPivot(page.locator('rb-pivot-table').first(),
          (x) => x.state.rendererName === 'Table Row Heatmap',
          'the published pivot has the DSL renderer');

        // ── The Filters dialog has its own example.
        await page.goBack();
        await page.locator('#btnCanvasName').waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator('#btnConfigureFilters').click();
        await page.locator('#btnFilterDslToggle').click();
        await page.locator('#btnShowFilterDslExample').click();
        await expect(page.locator('#dslExampleContainer .cm-content')).toContainText('parameter', { timeout: 15_000 });
        await page.locator('#btnCloseDslExample').click();
        await page.locator('#btnCloseFilterConfig').click();

        // − an invalid DSL shows "DSL error" and the table keeps rendering its last good config.
        await cSelectWidget(page, tabId);
        await cTypeDslAndStay(page, 'tabulator {\n  layout \n  initialSort([[\n');
        await expect(page.locator('#dslSyncError'), 'the editor says the DSL is wrong').toBeVisible({ timeout: 20_000 });
        const kept = await cReadTabulator(page, tabId);
        expect(kept.options.initialSort, 'the table keeps its last good config').toEqual([{ column: 'list_price', dir: 'desc' }]);
        expect(await cFirstRowCell(cViz(page, tabId), 'list_price')).toBeCloseTo(dearest, 2);
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

    // + back on Visual, the widget shows the visual query's result again.
    await page.locator('#btnQueryTab-visual').click();
    await expect(dRowCount(page), 'the visual query answers again').toContainText(`${D_ORDER_CHANNELS} rows returned`, { timeout: 30_000 });

    // − while on Visual, the edited SQL does not run, and has no Run button on screen.
    await expect(dRowCount(page)).not.toContainText('3 rows returned');
    await expect(page.locator('#btnRunSqlQuery')).toHaveCount(0);

    // + returning to Finetune still shows the edited SQL, as the code keeps it (`sql` survives a tab switch).
    await page.locator('#btnQueryTab-finetune').click();
    await expect(page.locator('#sqlEditorContainer .cm-content')).toContainText('LIMIT 3', { timeout: 15_000 });
  });
});

test('(canvas mechanics) M10 Detail column settings', async () => {
  test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
  await withFreshCanvas(page, 'E2E mech M10 Detail column settings', async (canvasId) => {
    // A one-row Detail whose numbers are in the query itself, so the expected text needs no seed.
    await addTableToCanvas(page, 'dash_demo.orders');
    await runSqlQuery(page, "SELECT 'Acme' AS company, 12345.678 AS score");
    await switchToWidget(page, 'detail');
    const detail = page.locator('rb-detail');
    await expect(detail).toContainText('Acme', { timeout: 30_000 });

    // + gear on one field: a new title, "Display as: Currency", 0 decimals.
    await dSetDetailColumn(page, 'score', { title: 'Final score', viewAs: 'currency', decimals: 0 });
    await expect(detail, 'the new title shows').toContainText('Final score');
    await expect(detail, 'the value is currency with no decimals').toContainText(/\$\s?12,346(?![.\d])/);

    // + and it is still there after a reload (it was stored, not just drawn).
    await expect
      .poll(async () => (await dStoredWidgets(page, canvasId))[0]?.displayConfig?.columnSettings?.score?.columnTitle, { timeout: 20_000 })
      .toBe('Final score');
    await page.reload();
    await expect(page.locator('rb-detail')).toContainText('Final score', { timeout: 60_000 });
    await expect(page.locator('rb-detail')).toContainText(/\$\s?12,346(?![.\d])/);

    // − Reset to defaults brings back the default display.
    await page.locator('[id="btnColumnSettings-score"]').click();
    await page.locator('#btnResetColumnSettings').click();
    await page.locator('#btnDoneColumnSettings').click();
    await page.locator('#panelColumnSettings').waitFor({ state: 'hidden', timeout: 5_000 });
    await expect(page.locator('rb-detail')).not.toContainText('Final score');
    await expect(page.locator('rb-detail')).not.toContainText('$');
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
    await expect(page.locator('[id^="btnVisualizeAs-"] #sparklesBadge')).toHaveCount(1);

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
    const stored = await eStoredWidgets(page, canvasId, (w) =>
      w.length === 4 || w.filter((x) => x.type === 'map' && x.displayConfig?.mapType).length === 3);
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
        const read = (id: string, tag: string) =>
          JSON.parse(JSON.stringify(
            ((document.getElementById(`widget-${id}`)?.querySelector(tag) as unknown as { options?: unknown })?.options) ?? {}));
        return { gauge: read(ids.g, 'rb-gauge'), trend: read(ids.t, 'rb-trend'), progress: read(ids.p, 'rb-progress') };
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
      const body = await openPublished(page, published.reportId);
      const gauge = body.locator(`[id="widgetGauge-${ids.gauge[0]}"]`);
      await expect(gauge).toContainText('Completed orders', { timeout: 60_000 });
      await expect(gauge).toContainText(/91\.9%|92%/);
      const trend = body.locator(`[id="widgetTrend-${ids.trend[0]}"]`);
      await expect(trend).toContainText('Orders per month', { timeout: 60_000 });
      await expect(trend).toContainText(eNumberPattern(Number(trendRows[trendRows.length - 1].orders)));
      const progress = body.locator(`[id="widgetProgress-${ids.progress[0]}"]`);
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
    const sqlBefore = await page.locator('#sqlEditorContainer .cm-content').innerText();
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
    expect(await page.locator('#sqlEditorContainer .cm-content').innerText()).toBe(sqlBefore);

    // Script.
    await eOpenFinetune(page, 'script');
    await page.locator('#btnAiHelpScript').click();
    const scriptPrompt = await eBuildAiPrompt(page, 'Rows of orders as a list of maps');
    expect(scriptPrompt).toMatch(/"tableName":\s*"(dash_demo\.)?orders"/);
    await page.locator('#btnDismissAiHelp').click();
    await expect(page.locator('#txtAiRequirement')).toHaveCount(0);

    // DSL: a chart's DSL editor.
    await page.locator('#btnQueryTab-visual').click();
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
      const sqlEditor = page.locator('#sqlEditorContainer .cm-content');
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
      expect(await fTabulatorText(page, 0), 'the reloaded canvas shows the new title').toContain('Order total');
      const again = await publishDashboard(page);
      expect(again.reportId, 'publishing again keeps the report').toBe(reportId);
      await openPublished(page, reportId);
      await expect.poll(() => fTabulatorText(page, 0), { message: 'the published table shows the new title', timeout: 60_000 })
        .toContain('Order total');
      expect(byId(cId).displayConfig.columnSettings, 'an untouched Tabulator stores no columnSettings').toBeUndefined();
      const untouched = await fTabulatorText(page, 1);
      expect(untouched, 'and renders its columns as before').toContain('segment');
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

      // − Cancel throws the draft away; − a click on the backdrop does the same.
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
        await page.locator('#tableShareLinks [id^="btnRevokeShareLink-"]').first().click();
        await page.locator('#btnShareClose').click();
        await expect(page.locator('#shareDialog')).not.toBeVisible();
      });
    } finally {
      if (reportId) await deleteReportAsAdmin(reportId);
    }
  });

  // ──────────────────────────────────────────────────────────
  // M34 — Reload button cancel (published page)
  // ──────────────────────────────────────────────────────────
  test('(canvas mechanics) M34 Reload can be cancelled', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let reportId: string | undefined;

    try {
      await withFreshCanvas(page, 'E2E mech M34 Reload cancel', async () => {
        await addFilterBarParam(page, G1_SMALL_DSL);
        await g1AddNumber(page);
        reportId = (await publishDashboard(page)).reportId;

        await openPublished(page, reportId);
        await page.evaluate(() => ((window as unknown as { __m34: number }).__m34 = 1));

        // − Cancel hides the question and leaves the page as it was.
        await page.locator('#btnReloadDashboard').click();
        await expect(page.locator('#btnConfirmReload')).toBeVisible();
        await page.locator('#btnCancelReload').click();
        await expect(page.locator('#btnConfirmReload')).not.toBeVisible();
        await expect(page.locator('#btnReloadDashboard')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __m34?: number }).__m34), 'nothing reloaded').toBe(1);

        // + asked again, Confirm goes on and the question goes away.
        await page.locator('#btnReloadDashboard').click();
        await expect(page.locator('#btnConfirmReload')).toBeVisible();
        await page.locator('#btnConfirmReload').click();
        await expect(page.locator('#btnConfirmReload')).not.toBeVisible();
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
      await expect(page.locator('rb-parameters')).toHaveCount(0);

      // + a parameter gets an id of its own, shown read-only.
      await addFilterBarParam(page, G1_SMALL_DSL);
      await page.locator('#btnConfigureFilters').click();
      const idInput = page.locator('[id="inputParamId-channel"]');
      await expect(idInput).toBeVisible();
      await expect(idInput).toHaveValue('channel');
      await expect(idInput, 'the id cannot be typed over').toHaveAttribute('readonly', '');
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
      await g2TableShows(page, /12,345\.68/, 'the plain number');
      expect(await g2Stored(page, canvasId, 'score'), 'no column settings yet').toBeUndefined();

      // + Style "Currency": the value gets a $ and the currency pickers appear.
      await g2Edit(page, gear, async () => {
        await expect(page.locator('#selectColumnCurrency'), '− a plain number has no currency picker').toHaveCount(0);
        await expect(page.locator('#selectColumnDateUnit'), '− a number has no date granularity').toHaveCount(0);
        await page.locator('#selectColumnNumberStyle').selectOption('currency');
        await expect(page.locator('#selectColumnCurrency')).toBeVisible();
        await expect(page.locator('#selectColumnCurrencyStyle')).toBeVisible();
      });
      await g2TableShows(page, /\$12,345\.68/, 'the value is currency');

      // + Unit of currency: EUR.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrency').selectOption('EUR');
      });
      await g2TableShows(page, /€12,345\.68/, 'euro sign');

      // + Currency label style: code, then name, then symbol again.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('code');
      });
      await g2TableShows(page, /EUR\s*12,345\.68/, 'the code');
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('name');
      });
      await g2TableShows(page, /12,345\.68\s*euros/i, 'the name');

      // + Decimals 0 (with the symbol back).
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnCurrencyStyle').selectOption('symbol');
        await page.locator('#numColumnDecimals').fill('0');
      });
      await g2TableShows(page, /€12,346(?![.\d])/, 'no decimals');

      // + Scale × 2.
      await g2Edit(page, gear, async () => {
        await page.locator('#numColumnScale').fill('2');
      });
      await g2TableShows(page, /€24,691(?![.\d])/, 'the value is doubled');

      // + Prefix and suffix.
      await g2Edit(page, gear, async () => {
        await page.locator('#txtColumnPrefix').fill('net ');
        await page.locator('#txtColumnSuffix').fill(' /yr');
      });
      await g2TableShows(page, /net .*24,691.*\/yr/, 'prefix and suffix');

      // + Compact notation shortens the number; − unticking it brings the full number back.
      await g2Edit(page, gear, async () => {
        await page.locator('#chkColumnCompact').check();
      });
      await g2TableShows(page, /\dK/, 'compact notation');
      await g2TableLacks(page, /24,691/, 'the long number is gone');
      await g2Edit(page, gear, async () => {
        await page.locator('#chkColumnCompact').uncheck();
      });
      await g2TableShows(page, /24,691/, 'the long number is back');

      // + Style "Percent": a %, and the currency pickers go again.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnNumberStyle').selectOption('percent');
        await expect(page.locator('#selectColumnCurrency'), '− percent has no currency picker').toHaveCount(0);
      });
      await g2TableShows(page, /24,691%/, 'percent');

      // + Style "Scientific" is stored and the % is gone.
      await g2Edit(page, gear, async () => {
        await page.locator('#selectColumnNumberStyle').selectOption('scientific');
      });
      await g2TableLacks(page, /%/, 'no percent any more');

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
      await g2TableShows(page, /net .*24,691/, 'the table still shows them');

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
      await g2TableShows(page, /12,345\.68/, 'reset brings the plain number back');
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
      await g2TableShows(page, /May 15, 2026/, 'the full date');
      expect(await g2Stored(page, canvasId, 'shipped_on'), 'no column settings yet').toBeUndefined();

      // + Year, then Quarter, then Month.
      await g2Edit(page, dateGear, async () => {
        await expect(page.locator('#numColumnScale'), '− a date has no number section').toHaveCount(0);
        await page.locator('#selectColumnDateUnit').selectOption('year');
      });
      await g2TableShows(page, /2026/, 'year');
      await g2TableLacks(page, /May/, 'year only');
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('quarter');
      });
      await g2TableShows(page, /Q2 2026/, 'quarter');
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('month');
      });
      await g2TableShows(page, /May 2026/, 'month');
      await g2TableLacks(page, /May 15/, 'no day any more');
      await expect
        .poll(async () => (await g2Stored(page, canvasId, 'shipped_on'))?.dateUnit, { message: 'the unit is stored', timeout: 20_000 })
        .toBe('month');

      // + an extraction unit on a plain number shown as a date: 3 becomes Q3.
      await g2TableLacks(page, /Q3/, 'no Q3 before');
      await g2Edit(page, quarterGear, async () => {
        await page.locator('#selectColumnViewAs').selectOption('date');
        await page.locator('#selectColumnDateUnit').selectOption('quarter-of-year');
      });
      await g2TableShows(page, /Q3/, 'quarter of year');
      await expect
        .poll(async () => g2Stored(page, canvasId, 'q_no'), { timeout: 20_000 })
        .toMatchObject({ viewAs: 'date', dateUnit: 'quarter-of-year' });

      // + "Auto" takes the unit away again.
      await g2Edit(page, dateGear, async () => {
        await page.locator('#selectColumnDateUnit').selectOption('auto');
      });
      await g2TableShows(page, /May 15, 2026/, 'the full date is back');
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
      const detail = page.locator('rb-detail');
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
      await g2Edit(page, 'btnColumnSettings-score', async () => {
        await page.locator('#txtColumnSuffix').fill(' pts');
        await page.locator('#numColumnScale').fill('2');
      });
      await expect(detail).toContainText('pts');
      await expect(detail).toContainText(/24,691/);
      await expect
        .poll(async () => g2Stored(page, canvasId, 'score'), { timeout: 20_000 })
        .toMatchObject({ suffix: ' pts', scale: 2 });

      // + the X and the dark area close the panel without a change.
      await g2OpenAndClose(page, 'btnColumnSettings-score', 'x');
      await g2OpenAndClose(page, 'btnColumnSettings-score', 'overlay');
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
      await expect(page.locator('#dslExampleContainer .cm-content')).toContainText('tabulator', { timeout: 15_000 });
      await page.locator('#btnDismissDslExample').click();
      await expect(page.locator('#dslExampleContainer')).toHaveCount(0);
      expect(await eClipboardText(page), 'dismiss copies nothing').toBe('g2 sentinel');

      // + Copy puts the example on the clipboard.
      await page.locator('#btnShowDslExample').click();
      await expect(page.locator('#dslExampleContainer .cm-content')).toContainText('tabulator', { timeout: 15_000 });
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
      const pickCube = page.locator('[id^="chkPickCube-"]').first();
      await expect(pickCube).toBeVisible({ timeout: 15_000 });
      await expect(pickCube, 'no cube is ticked to begin with').not.toBeChecked();
      await pickCube.check();
      await expect(pickCube).toBeChecked();
      await pickCube.uncheck();
      await expect(pickCube).not.toBeChecked();

      // + The picker's own Cubes group (the second one on the page, after the left panel's) folds its checkboxes away.
      const pickerGroup = page.locator('#btnToggleCubesGroup').last();
      await pickerGroup.click();
      await expect(page.locator('[id^="chkPickCube-"]'), 'a collapsed group lists no checkbox').toHaveCount(0);
      await pickerGroup.click();
      await expect(page.locator('[id^="chkPickCube-"]').first()).toBeVisible();

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

      // − A divider nobody selected has no delete button.
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
    await page.locator('#btnRemoveChartXAxis-1').click();
    await expect(page.locator('#btnChartStacked-on')).toHaveCount(0);
    await expect(page.locator('#btnChartStacked-off')).toHaveCount(0);

    // + a bubble chart takes its radius from the measure chosen as Size.
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
      p = await cWaitPivot(pivot, (x) => x.state.vals.join() === 'total_amount', 'the reader picked total_amount');
      g5ExpectCells(p, g5Sums(), 'total_amount summed per status and channel');
      await expect(page.locator('[id$="btnPivotVal-0"]')).toContainText('total_amount');

      // + back to Count: the picker goes away (Count takes no field) and the counts are back.
      await page.locator('[id$="btnPivotAggregator"]').click();
      await page.locator(`[id$="btnPivotAggregator-${g5Token('Count')}"]`).click();
      p = await cWaitPivot(pivot, (x) => x.state.aggregatorName === 'Count', 'Count again');
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
});

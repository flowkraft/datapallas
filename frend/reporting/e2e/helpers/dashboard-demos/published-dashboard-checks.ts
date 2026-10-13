// ═══════════════════════════════════════════════════════════════════════════════
// published-dashboard-checks.ts
// A published Dashboard Demo, checked the way a reader meets it (section 9.3).
//
// ONE CODE PATH, TWO PLACES
//
// The same dashboard is met twice: on its own page (`/dashboard/g-dd-…`), and as
// one card of the Gallery, where 25 of them sit on one page. So every function
// here takes a `root` Locator — the card (`#dd-<id>`) or the whole page — and
// reaches nothing outside it. Every Canvas template carries the same ids
// (`#parameterBarContainer`, and one per filter), 25 times over on the Gallery,
// and that is exactly why nothing here selects from the page down.
//
// WHAT IS TRUE
//
// The values a tile must show are the demo's `checks.json`, the same claims the
// Java loop holds the assembled dashboard to (`DashboardDemosQueriesTest`), and
// they are read off the tile by the same rules that loop reads them by —
// `reading()` below is a port of `DashboardDemos.reading()`, kept in step with
// it deliberately, the way `cube-stories-test-helper.ts` keeps `normalise()` in
// step with the Java vendor loop's. Each claim is then checked twice, as
// `assertDashboardRendersCorrectly` does: the text the reader sees, and the
// `/api/reports/<id>/data` answer behind it.
//
// SELECTORS
//
// Controls are reached by their id, never by class, text, role or position
// (section 9.3). A tile is reached by its own id, `<prefix>-<component id>`
// (`widgetValue-…`, `widgetChart-…`): the component id is the dashboard's own
// name for the tile, the one its `/data` calls use, so it is the widget's
// identity and not its looks. A dashboard is `dashboard-<report id>`, and a
// dashboard's own page is `#publishedDashboard`.
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Locator, type Page } from '@playwright/test';

import {
  asQuery,
  asText,
  loadChecks,
  paramsItDeclares,
  declaredParams,
  widgetsFor,
  type Demo,
  type DemoChecks,
  type DemoWidget,
  type Interaction,
  type Kpi,
  type ParamMeta,
} from './demo-catalog';

/** The id prefix each widget type's tile is drawn under, which is also how many of them a demo must show. */
const TILE_ID: Record<string, string> = {
  number: 'widgetValue',
  trend: 'widgetTrend',
  gauge: 'widgetGauge',
  progress: 'widgetProgress',
  chart: 'widgetChart',
  tabulator: 'widgetTabulator',
  pivot: 'widgetPivot',
  map: 'widgetMap',
  sankey: 'widgetSankey',
  detail: 'widgetDetail',
};

/** The tiles whose reading is a number or a word the reader can see written out. */
const WRITTEN_OUT = ['number', 'trend', 'gauge', 'progress'];

/** What a tile says while it is still asking. */
const STILL_ASKING = ['...', '…', ''];

// ── Where a dashboard is ──────────────────────────────────────────────────────

/** One card of the Gallery: everything that card holds, and nothing of its neighbours'. */
export function cardOf(page: Page, demo: Demo): Locator {
  return page.locator(`#${demo.id}`);
}

/**
 * A dashboard on its own page, open and drawn.
 *
 * `params` are the starting values a link can carry (TODO 5f), written as a reader's own address bar
 * would write them: plain names on a dashboard's own page.
 */
export async function openPublished(
  page: Page,
  reportId: string,
  params: Record<string, unknown> = {},
  baseUrl = 'http://localhost:9090',
): Promise<Locator> {
  const query = asQuery(params);
  await page.goto(`${baseUrl}/dashboard/${reportId}${query ? `?${query}` : ''}`, {
    timeout: 60_000,
    waitUntil: 'networkidle',
  });
  const dashboard = page.locator('#publishedDashboard');
  await expect(dashboard, `${reportId} is published and its page opens`).toBeVisible({ timeout: 60_000 });
  return dashboard;
}

/**
 * The same values, keyed the way a page that holds more than one dashboard carries them.
 *
 * A dashboard reads the plain name of a filter only on its own page (`url-start-values.ts`): on the
 * Gallery a key is `<report id>.<filter>`, which is what keeps 25 dashboards from reading each
 * other's values. A link to the Gallery therefore writes its keys this way.
 */
export function prefixed(demo: Demo, params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params ?? {})) out[`${demo.reportId}.${name}`] = value;
  return out;
}

/**
 * The card scrolled to, which is what loads the dashboard on it (TODO 5g, `lazy`).
 *
 * The card's own box is there from the first paint — it keeps the demo's height so the page does not
 * jump — and the dashboard inside it arrives after the scroll.
 */
export async function scrollCardIntoView(page: Page, demo: Demo): Promise<Locator> {
  const card = cardOf(page, demo);
  await expect(card, `the Gallery has a card for ${demo.id}`).toHaveCount(1, { timeout: 60_000 });
  await card.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(card.locator(`[id="dashboard-${demo.reportId}"]`), `${demo.id} loads when it is scrolled to`)
    .toBeVisible({ timeout: 60_000 });
  return card;
}

/**
 * The credential this dashboard was handed, if it was handed one (a share link's page is): an
 * attribute of the element that draws `dashboard-<report id>`.
 */
export async function embedTokenOf(root: Locator, reportId: string): Promise<string> {
  const dashboard = root.locator(`[id="dashboard-${reportId}"]`);
  if ((await dashboard.count()) === 0) return '';
  return dashboard.evaluate((box) => box.parentElement?.getAttribute('embed-token') ?? '');
}

// ── Ids ───────────────────────────────────────────────────────────────────────

/**
 * No id twice inside one root.
 *
 * The Gallery repeats every Canvas template's ids once per card, which is why this is asked per card
 * and never of the whole page: inside one dashboard an id is a name, and two things answering to one
 * name is a defect a test that clicks by id would otherwise find as a flake.
 */
export async function assertUniqueIds(root: Locator): Promise<void> {
  const twice = await root.evaluate((el) => {
    const seen = new Map<string, number>();
    for (const one of Array.from(el.querySelectorAll('[id]')))
      seen.set(one.id, (seen.get(one.id) ?? 0) + 1);
    return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
  });
  expect(twice, 'every id inside this dashboard names one thing').toEqual([]);
}

// ── Driving the filter bar as a reader does ───────────────────────────────────

/** A value as `rb-parameters` writes it into an option's id: `Smart Home` is `Smart_Home`. */
function safeId(value: unknown): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * One filter, set the way the reader sets it: the control that is drawn is the control that is used.
 *
 * Which control a parameter is drawn as is the component's decision (`controlTypeOf`, its type and
 * its `uiHints`), so it is read off the page rather than worked out again here: a select is picked
 * from, a date is typed, a tick box is ticked, a radio is clicked, and a multiselect is opened,
 * ticked and confirmed. That way a parameter given another control later is still driven correctly.
 */
export async function setParam(root: Locator, param: ParamMeta, value: unknown): Promise<void> {
  const control = root.locator(`#${param.id}`);
  await expect(control, `${param.id} has a control in this dashboard's filter bar`)
    .toHaveCount(1, { timeout: 30_000 });

  const kind = await control.evaluate((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'input') return (el as HTMLInputElement).type;
    if (tag === 'button') return 'multi';
    if (tag === 'div') return 'radio';
    return tag;
  });

  const wanted = Array.isArray(value) ? value.map((one) => String(one)) : [asText(value)];

  switch (kind) {
    case 'select':
      await control.selectOption(wanted[0] ?? '');
      break;
    case 'checkbox':
      if (wanted[0] === 'true') await control.check();
      else await control.uncheck();
      break;
    case 'radio':
      await root.locator(`#${param.id}_rb_${safeId(wanted[0] ?? '')}`).click();
      break;
    case 'multi': {
      await control.click();
      const modal = root.locator(`#${param.id}_modal`);
      await expect(modal, `${param.id} opens its list`).toBeVisible({ timeout: 30_000 });
      await root.locator(`#${param.id}_btnNone`).click();
      for (const one of wanted.filter((v) => v !== ''))
        await root.locator(`#${param.id}_cb_${safeId(one)}`).check();
      await root.locator(`#${param.id}_btnOk`).click();
      await expect(modal, `${param.id} closes on OK`).toBeHidden({ timeout: 30_000 });
      break;
    }
    default:
      await control.fill(wanted[0] ?? '');
      break;
  }
}

/** Several filters of one dashboard, and only the ones that dashboard really declares. */
export async function setParams(
  root: Locator,
  demo: Demo,
  params: Record<string, unknown>,
): Promise<void> {
  const declared = new Map(declaredParams(demo.id).map((p) => [p.id, p]));
  for (const [name, value] of Object.entries(paramsItDeclares(demo.id, params))) {
    const param = declared.get(name);
    if (param) await setParam(root, param, value);
  }
}

/**
 * The reader's "ask again": Apply, the button under the filters, which reloads at once (#18). The
 * root is one dashboard (a card, or a dashboard's own page), so it holds one.
 */
export async function reloadDashboard(root: Locator): Promise<void> {
  await root.locator('#btnReloadDashboard').click();
}

/**
 * The values the filter bar of this dashboard is standing on. A multiselect's value is what its list
 * has ticked, in the form `asStanding` gives an expected value.
 */
export async function readParams(root: Locator, demo: Demo): Promise<Record<string, string>> {
  const standing: Record<string, string> = {};
  const declared = declaredParams(demo.id);
  // The bar is filled after the dashboard is on the page (a Gallery card loads when it is scrolled
  // to), and a filter it has not drawn yet would be read as one it does not have.
  if (declared.length > 0)
    await expect(root.locator(`#${declared[0].id}`),
      `${demo.id} has drawn its filter bar`).toBeAttached({ timeout: 60_000 });
  for (const param of declared) {
    const control = root.locator(`#${param.id}`);
    if ((await control.count()) === 0) continue;
    if (await control.evaluate((el) => el.tagName.toLowerCase() === 'button')) {
      standing[param.id] = await tickedIn(root, param.id);
      continue;
    }
    standing[param.id] = await control.evaluate((el, id) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') return (el as HTMLSelectElement).value;
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        return input.type === 'checkbox' ? String(input.checked) : input.value;
      }
      if (tag === 'div') {
        const picked = el.querySelector(`[id^="${id}_rb_"]:checked`) as HTMLInputElement | null;
        return picked ? picked.value : '';
      }
      return '';
    }, param.id);
  }
  return standing;
}

/**
 * What a multiselect has ticked, read where the reader sees it: its list is drawn only while it is
 * open, so it is opened, read page by page, and closed with Cancel, which changes nothing. "All" is
 * the wildcard the bar holds for every option.
 */
async function tickedIn(root: Locator, id: string): Promise<string> {
  await root.locator(`#${id}`).click();
  const modal = root.locator(`#${id}_modal`);
  await expect(modal, `${id} opens its list`).toBeVisible({ timeout: 30_000 });
  try {
    if ((await root.locator(`#${id}_lblCount`).innerText()).trim() === 'All') return '*';
    const ticked: string[] = [];
    for (let page = 1; ; page++) {
      ticked.push(...await modal.locator(`[id^="${id}_cb_"]:checked`).evaluateAll((boxes) =>
        boxes.map((box) => (box as HTMLInputElement).value)));
      const next = root.locator(`#${id}_btnNextPage`);
      if ((await next.count()) === 0 || await next.isDisabled()) break;
      await next.click();
      await expect(root.locator(`#${id}_lblPagePos`)).toHaveText(new RegExp(`^Page ${page + 1} of`));
    }
    return joinPicked(ticked);
  } finally {
    await root.locator(`#${id}_btnCancel`).click();
    await expect(modal, `${id} closes on Cancel`).toBeHidden({ timeout: 30_000 });
  }
}

/**
 * A filter value as `readParams` reports it. A multiselect's list shows which values are ticked, not
 * the order they were picked in, so its values are sorted and joined, a comma inside one escaped as
 * the bar escapes it; any other filter's value is its text.
 */
export function asStanding(demo: Demo, name: string, value: unknown): string {
  const param = declaredParams(demo.id).find((p) => p.id === name);
  const multi = /^multi-?select$/i.test(String(param?.uiHints?.control ?? ''));
  if (!multi) return String(value ?? '');
  if (value === '*') return '*';
  return joinPicked(Array.isArray(value) ? value.map((one) => String(one)) : splitPicked(String(value ?? '')));
}

/** Several picked values as one text: sorted, a backslash or a comma inside a value escaped. */
function joinPicked(values: string[]): string {
  return values.slice().sort()
    .map((one) => one.replace(/\\/g, '\\\\').replace(/,/g, '\\,'))
    .join(',');
}

/** The other way: an unescaped comma separates two values (as `splitEscaped` in the web components). */
function splitPicked(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let escaped = false;
  for (const ch of text) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === ',') { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.map((one) => one.trim()).filter((one) => one.length > 0);
}

// ── What a tile shows ─────────────────────────────────────────────────────────

/** One tile of this dashboard, by its own id: the name its own dashboard calls it. */
export function tileOf(root: Locator, widget: DemoWidget): Locator {
  const prefix = TILE_ID[widget.type] ?? 'widgetValue';
  return root.locator(`[id="${prefix}-${widget.componentId}"]`);
}

/**
 * The rows behind a tile, asked for exactly as the tile asks for them.
 *
 * The credential is the page's own: a reader who arrived by a share link has one embed token and
 * nothing else, so that is what this sends. A signed-in page sends nothing and its session carries.
 */
export async function askData(
  root: Locator,
  demo: Demo,
  widget: DemoWidget,
  params: Record<string, unknown>,
  baseUrl = 'http://localhost:9090',
): Promise<Array<Record<string, unknown>>> {
  const token = await embedTokenOf(root, demo.reportId);
  const query = asQuery(paramsItDeclares(demo.id, params));
  const url = `${baseUrl}/api/reports/${demo.reportId}/data?componentId=${encodeURIComponent(widget.componentId)}`
    + (query ? `&${query}` : '');
  const answer = await root.page().request.get(url, {
    headers: token ? { 'X-Embed-Token': token } : {},
  });
  expect(answer.status(), `${demo.id}/${widget.key} answers its own data call`).toBe(200);
  const body = await answer.json();
  return (body.data ?? body.rows ?? []) as Array<Record<string, unknown>>;
}

/**
 * The reading of a tile out of the rows its query answered — a port of
 * `DashboardDemos.reading()` (bkend/server, test scope).
 *
 * The two must agree, because they read the same claims of the same widgets: the Java loop asks the
 * services the Canvas calls, and this asks the published dashboard. Where they could disagree the
 * claim itself says how it is read (`reading`, `column`, `row`, `labels`), so both follow the file.
 */
export function reading(widget: DemoWidget, rows: Array<Record<string, unknown>>, kpi: Kpi): unknown {
  const how = kpi.reading ?? '';
  const column = kpi.column ?? null;
  // A twin's widget that is not built as its original: its columns read under the original's names.
  let answered = widget.columns ? renamed(rows ?? [], widget.columns) : rows ?? [];

  if (how === 'rows') return answered.length;
  if (how === 'distinct')
    return new Set(answered.map((row) => String(valueOf(row, column) ?? ''))).size;
  if (answered.length === 0) return null;

  if (how === 'argmax') {
    let peak: Record<string, unknown> | null = null;
    let best = Number.NEGATIVE_INFINITY;
    for (const row of answered) {
      const value = valueOf(row, column);
      if (value === null || value === undefined) continue;
      const number = Number(value);
      if (number > best) {
        best = number;
        peak = row;
      }
    }
    if (!peak) return null;
    return (kpi.labels ?? []).map((label) => String(valueOf(peak as Record<string, unknown>, label) ?? '')).join(' ');
  }

  if (kpi.row) {
    const kept = answered.filter((row) => holds(row, kpi.row as Record<string, unknown>));
    if (kept.length === 0) return null;
    answered = kept;
  }

  if (how === 'mean') {
    const sum = answered.reduce((total, row) => total + Number(valueOf(row, column)), 0);
    return sum / answered.length;
  }
  if (column !== null) return valueOf(answered[0], column);

  const display = widget.displayConfig;
  let field = '';
  let row: Record<string, unknown>;
  switch (widget.type) {
    case 'trend':
      field = String(display.valueField ?? '');
      row = answered[answered.length - 1];
      break;
    case 'gauge':
    case 'progress':
      field = String(display.field ?? '');
      row = answered[0];
      break;
    case 'number':
      field = String(display.numberField ?? '');
      row = answered[0];
      break;
    default:
      row = answered[0];
      break;
  }
  if (widget.columns && rows.length > 0) field = originalName(rows[0], field, widget.columns);
  // A visual-mode tile names the source column and the builder aliased it (total_amount_sum), so
  // the first column is the reading wherever the named one is not in the answer.
  const value = has(row, field) ? valueOf(row, field) : first(row);
  const format = String(display.numberFormat ?? display.gaugeFormat ?? display.format ?? '');
  if (format === 'percent' && typeof value === 'number') return value * 100;
  return value;
}

/** Whether a claim's value is the one a tile shows — `DashboardDemos.shows()`, in TypeScript. */
export function shows(want: unknown, got: unknown): boolean {
  if (want === null || want === undefined) return got === null || got === undefined;
  if (typeof want === 'string') return got !== null && got !== undefined && String(got) === want;
  if (got === null || got === undefined) return false;
  return Math.abs(Number(got) - Number(want)) <= 0.005;
}

/** Rows under other column names, matched by position: the first column is `names[0]`, and so on. */
export function renamed(rows: Array<Record<string, unknown>>, names: string[]): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).forEach(([name, value], i) => { out[i < names.length ? names[i] : name] = value; });
    return out;
  });
}

/** The original's name of one of a twin's columns (the one at the same place), or the name itself. */
function originalName(row: Record<string, unknown>, field: string, names: string[]): string {
  const at = Object.keys(row).findIndex((name) => name.toLowerCase() === field.toLowerCase());
  return at >= 0 && at < names.length ? names[at] : field;
}

/**
 * Where two answers of the same tile first part, or null when they are the same: the same rows in
 * the same order, the columns matched by position (a twin names its columns itself), a number the
 * same at the precision a tile shows it (a cent, or a hundredth of a percent for a fraction under 1).
 */
export function rowsDifference(
  want: Array<Record<string, unknown>>,
  got: Array<Record<string, unknown>>,
): string | null {
  if (want.length !== got.length) return `the original answers ${want.length} rows, the twin ${got.length}`;
  for (let r = 0; r < want.length; r++) {
    const left = Object.values(want[r]);
    const right = Object.values(got[r]);
    if (left.length !== right.length)
      return `row ${r + 1}: the original has ${left.length} columns (${Object.keys(want[r]).join(', ')}),`
        + ` the twin ${right.length} (${Object.keys(got[r]).join(', ')})`;
    for (let c = 0; c < left.length; c++) {
      if (!sameCell(left[c], right[c]))
        return `row ${r + 1}, column ${c + 1}: the original has ${JSON.stringify(left[c])}, the twin ${JSON.stringify(right[c])}`;
    }
  }
  return null;
}

function sameCell(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  const x = typeof a === 'number' ? a : typeof a === 'string' && a.trim() !== '' && !isNaN(Number(a)) ? Number(a) : null;
  const y = typeof b === 'number' ? b : typeof b === 'string' && b.trim() !== '' && !isNaN(Number(b)) ? Number(b) : null;
  if (x !== null && y !== null) return Math.abs(x - y) <= (Math.abs(x) < 1 ? 0.00005 : 0.005);
  return String(a) === String(b);
}

/** The column names a dashboard's widget answers with, in order: the first row's. */
export async function columnsOf(
  root: Locator,
  demo: Demo,
  widget: DemoWidget,
  params: Record<string, unknown>,
): Promise<string[]> {
  const rows = await askData(root, demo, widget, params);
  if (rows.length === 0) throw new Error(`${demo.id}/${widget.key} answers no row, so its columns are unknown`);
  return Object.keys(rows[0]);
}

function valueOf(row: Record<string, unknown>, column: string | null): unknown {
  if (column === null) return first(row);
  if (column in row) return row[column];
  for (const [name, value] of Object.entries(row))
    if (name.toLowerCase() === column.toLowerCase()) return value;
  throw new Error(`no column '${column}' in ${Object.keys(row).join(', ')}`);
}

function has(row: Record<string, unknown>, column: string): boolean {
  if (!column) return false;
  return Object.keys(row).some((name) => name.toLowerCase() === column.toLowerCase());
}

function first(row: Record<string, unknown>): unknown {
  const values = Object.values(row ?? {});
  return values.length === 0 ? null : values[0];
}

function holds(row: Record<string, unknown>, wanted: Record<string, unknown>): boolean {
  for (const [column, value] of Object.entries(wanted)) {
    const got = String(valueOf(row, column) ?? '');
    if (Array.isArray(value)) {
      if (!value.some((one) => got === String(one))) return false;
    } else if (got !== String(value)) {
      return false;
    }
  }
  return true;
}

/**
 * What a tile writes as its reading, apart from the other things it writes beside it. A trend writes
 * its label, its value and "x% vs prior"; a gauge writes its value and label inside its svg, where
 * the tile's own text does not reach; a progress bar writes "value / goal" and then a percent.
 */
async function writtenReading(tile: Locator, type: string, componentId: string): Promise<string> {
  if (type === 'trend') return tile.locator(`[id="trendValue-${componentId}"]`).innerText();
  if (type === 'gauge') return (await tile.locator(`[id="gaugeValue-${componentId}"]`).textContent()) ?? '';
  if (type === 'progress') {
    const lines = (await tile.innerText()).split('\n');
    return (lines.find((line) => line.includes(' / ')) ?? '').split(' / ')[0];
  }
  return tile.innerText();
}

/** The number a tile has written out, as a number: what the reader reads, commas and all. */
function asNumber(text: string): number | null {
  const bare = text.replace(/[^0-9.,\-]/g, '').replace(/,/g, '');
  if (bare === '' || bare === '-' || bare === '.') return null;
  const number = Number(bare);
  return Number.isNaN(number) ? null : number;
}

// ── The whole dashboard ───────────────────────────────────────────────────────

/**
 * Every chart inside this root has drawn something.
 *
 * `waitForRbChartsRendered` (e2e/utils/docs-screenshot-helper.ts) asks the same question of every
 * chart on the page, which is right for a dashboard's own page and wrong for the Gallery: the cards
 * below the fold are deliberately not loaded yet (TODO 5g), so waiting for them all would wait for
 * ever. The pixel probe is the same one: any non-zero alpha anywhere on the canvas.
 */
export async function waitForChartsIn(root: Locator, timeout = 60_000): Promise<void> {
  const charts = root.locator('[id^="chartCanvas-"]');
  if ((await charts.count()) === 0) return;
  await expect
    .poll(
      async () =>
        charts.evaluateAll((els) =>
          els.every((el) => {
            const canvas = el as HTMLCanvasElement;
            if (!canvas.width || !canvas.height) return false;
            try {
              const ctx = canvas.getContext('2d');
              if (!ctx) return false;
              const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              for (let i = 3; i < data.length; i += 16) if (data[i] !== 0) return true;
              return false;
            } catch {
              return false;
            }
          }),
        ),
      { timeout, intervals: [500] },
    )
    .toBe(true);
}

/** The Chart.js options a chart is drawing with, for a claim about how a tile looks (TODO 5b). */
export async function readChartOptions(
  root: Locator,
  componentId: string,
): Promise<Record<string, unknown>> {
  const chart = root.locator(`[id="widgetChart-${componentId}"]`);
  await expect(chart, `${componentId} is a chart of this dashboard`).toHaveCount(1, { timeout: 30_000 });
  return chart.evaluate((box) => {
    // The chart's box is inside its element's shadow root; Chart.js is held by the element.
    const el = (box.getRootNode() as ShadowRoot).host ?? box;
    const drawn = (el as any).chart ?? (el as any).chartInstance;
    return JSON.parse(JSON.stringify(drawn?.options ?? (el as any).mergedOptions ?? {}));
  });
}

/**
 * The dashboard is loaded, it is showing real data, and what it shows is what its checks say.
 *
 * Three things, in the order a reader meets them: the tiles the demo has are all there; none of them
 * is still asking or empty; and every claim of the checks holds twice over — the text on the tile,
 * and the `/data` answer behind it, read by the claim's own rule.
 */
export async function assertDemoDashboard(
  root: Locator,
  demo: Demo,
  checks: DemoChecks = loadChecks(demo.id),
): Promise<void> {
  await assertDemoDrawn(root, demo);
  await assertClaims(root, demo, checks.defaults, checks.kpis, 'at its defaults');
  await assertUniqueIds(root);
}

/**
 * The first two of those things, with no claim about a number: the tiles are all there, and each one
 * has drawn real content. It is all a page can promise about a dashboard whose data was seeded on
 * another day (the public installation, `dashboard-demos.public.ts`), where a claim's number is the
 * local run's and not the page's.
 */
export async function assertDemoDrawn(root: Locator, demo: Demo): Promise<void> {
  const dashboard = root.locator(`[id="dashboard-${demo.reportId}"]`);
  await expect(dashboard, `${demo.id} is on the page`).toBeVisible({ timeout: 60_000 });

  // The tiles it has, counted by type: a widget that stopped being exported is a page with a hole
  // in it, and no claim below would notice on its own.
  const widgets = widgetsFor(demo);
  for (const [type, prefix] of Object.entries(TILE_ID)) {
    const expected = widgets.filter((w) => w.type === type).length;
    if (expected === 0) continue;
    await expect(root.locator(`[id^="${prefix}-"]`), `${demo.id} shows its ${expected} ${type} tile(s)`)
      .toHaveCount(expected, { timeout: 60_000 });
  }
  await expect(root.locator('#parameterBarContainer'), `${demo.id} has its own filter bar`)
    .toHaveCount(declaredParams(demo.id).length > 0 ? 1 : 0, { timeout: 30_000 });

  await waitForChartsIn(root);

  // Every data tile has an answer, not a spinner and not a blank.
  for (const widget of widgets) {
    if (!TILE_ID[widget.type]) continue;
    const tile = tileOf(root, widget);
    if (WRITTEN_OUT.includes(widget.type)) {
      await expect
        .poll(async () => (await tile.innerText()).trim(), { timeout: 60_000, intervals: [500] })
        .not.toMatch(/^(\.\.\.|…)?$/);
      continue;
    }
    if (widget.type === 'tabulator') {
      // A table has an answer when it has drawn a row: tabRow-<component id>-<n>.
      await expect
        .poll(async () => root.locator(`[id^="tabRow-${widget.componentId}-"]`).count(),
          { timeout: 60_000, intervals: [500] })
        .toBeGreaterThan(0);
      continue;
    }
    if (['pivot', 'map', 'sankey', 'detail'].includes(widget.type)) {
      await expect
        .poll(async () => tile.evaluate((el) => el.innerHTML.length),
          { timeout: 60_000, intervals: [500] })
        .toBeGreaterThan(0);
    }
  }

}

/** Every claim of one set of filter values, read off the tile and out of the answer behind it. */
export async function assertClaims(
  root: Locator,
  demo: Demo,
  params: Record<string, unknown>,
  kpis: Kpi[],
  when: string,
): Promise<void> {
  for (const kpi of kpis) {
    const widget = widgetsFor(demo).find((w) => w.key === kpi.widget);
    expect(widget, `${demo.id} has the widget '${kpi.widget}' its checks name`).toBeTruthy();
    const tile = tileOf(root, widget as DemoWidget);

    // 1. The answer behind the tile, read by the claim's own rule.
    const rows = await askData(root, demo, widget as DemoWidget, params);
    const answered = reading(widget as DemoWidget, rows, kpi);
    expect(
      shows(kpi.value, answered),
      `${demo.id}/${kpi.widget} ${when}: its data answers ${JSON.stringify(answered)},`
        + ` and its check says ${JSON.stringify(kpi.value)}`,
    ).toBe(true);

    // 2. And what the reader sees, wherever the tile writes its reading out. A chart, a table or a
    //    map draws its answer instead of writing it, and the claim about those is the answer above.
    const type = (widget as DemoWidget).type;
    if (!WRITTEN_OUT.includes(type) || typeof kpi.value !== 'number') continue;
    // The tile rounds for the reader (a currency to the penny, a percent to a digit), so what is
    // asserted is that the reader is being shown this claim's number and not another one. A tile
    // takes its new answer a moment after the filters ask for it, so the reading is asked for until
    // it is this claim's number, and a number that never arrives is the failure.
    const want = Number(kpi.value);
    const near = Math.max(Math.abs(want) * 0.005, 0.05);
    let shown: number | null = null;
    try {
      await expect
        .poll(async () => {
          shown = asNumber((await writtenReading(tile, type, (widget as DemoWidget).componentId)).trim());
          return shown !== null && Math.abs(shown - want) <= near;
        }, { timeout: 20_000, intervals: [250] })
        .toBe(true);
    } catch {
      throw new Error(shown === null
        ? `${demo.id}/${kpi.widget} ${when}: the tile writes a number out`
        : `${demo.id}/${kpi.widget} ${when}: the tile reads ${shown} and its check says ${want}`);
    }
  }
}

/**
 * Every interaction of a demo, done as a reader does it: set the filters, ask again, read the tiles.
 *
 * The last thing it does is put the dashboard back to its defaults and check them again — which
 * proves the reset and leaves the Gallery as the next card found it.
 */
export async function runInteractions(
  root: Locator,
  demo: Demo,
  checks: DemoChecks = loadChecks(demo.id),
): Promise<void> {
  for (const interaction of checks.interactions ?? []) {
    // An interaction's claims are about its whole set of filter values (`params`: the defaults with
    // `changed` on top), so every filter is put where it says, not only the ones it changes: the
    // interaction before it may have left another filter elsewhere.
    await setParams(root, demo, interaction.params);
    await reloadDashboard(root);
    await waitForChartsIn(root);
    await assertClaims(root, demo, interaction.params, interaction.kpis, `under '${interaction.id}'`);
    await assertUniqueIds(root);
  }

  if ((checks.interactions ?? []).length === 0) return;
  await setParams(root, demo, checks.defaults);
  await reloadDashboard(root);
  await waitForChartsIn(root);
  await assertClaims(root, demo, checks.defaults, checks.kpis, 'back at its defaults');
}

/** One interaction by its id, for a test that is about that one thing. */
export function interactionOf(checks: DemoChecks, id: string): Interaction {
  const interaction = (checks.interactions ?? []).find((one) => one.id === id);
  if (!interaction)
    throw new Error(`${checks.id} has no interaction '${id}'; it has `
      + (checks.interactions ?? []).map((one) => one.id).join(', '));
  return interaction;
}

// ── Maps ────────────────────────────────────────────────────────────────────

/**
 * Every map in the root is covered by the world from edge to edge: no grey band past the world's
 * top or bottom, or beside it. Read off the tiles themselves - Leaflet places a tile only where the
 * world is - so it holds whether or not the tile pictures could be downloaded.
 */
export async function assertMapsFillTheirBoxes(root: Locator, context: string): Promise<void> {
  const maps = root.locator('rb-map .leaflet-container');
  const count = await maps.count();
  for (let i = 0; i < count; i++) {
    const map = maps.nth(i);
    // Leaflet keeps the tiles of the zoom it left until the new ones are in; wait for one level.
    await expect.poll(() => map.locator('.leaflet-tile-container').count(),
      { message: `${context}: map ${i + 1} settles on one zoom`, timeout: 30_000 }).toBe(1);
    const gaps = await map.evaluate((box) => {
      const frame = box.getBoundingClientRect();
      const tiles = Array.from(box.querySelectorAll('img.leaflet-tile')).map((t) => t.getBoundingClientRect());
      if (tiles.length === 0) return 'no tile at all';
      const top = Math.min(...tiles.map((t) => t.top)), bottom = Math.max(...tiles.map((t) => t.bottom));
      const left = Math.min(...tiles.map((t) => t.left)), right = Math.max(...tiles.map((t) => t.right));
      const out: string[] = [];
      if (top > frame.top + 1) out.push(`${Math.round(top - frame.top)}px above the world`);
      if (bottom < frame.bottom - 1) out.push(`${Math.round(frame.bottom - bottom)}px below the world`);
      if (left > frame.left + 1) out.push(`${Math.round(left - frame.left)}px left of the world`);
      if (right < frame.right - 1) out.push(`${Math.round(frame.right - right)}px right of the world`);
      return out.join(', ');
    });
    expect(gaps, `${context}: map ${i + 1} is filled by the world`).toBe('');
  }
}

// ── Nothing went wrong while all that happened ────────────────────────────────

/** What a page complained about while a test was using it. */
export interface ErrorWatch {
  /** Nothing was logged as an error and nothing failed to load. */
  assertNone(context?: string): void;
  messages: string[];
  /** How many map tiles the page asked OpenStreetMap for: a map that drew none is not proven by the watch. */
  mapTiles: number;
}

/**
 * Watch a page for the errors a reader would never see but a broken dashboard leaves behind: a
 * console error, an uncaught exception, a request that came back 4xx or 5xx.
 *
 * A dialog is a failure too, and deliberately so: a value out of a URL must never become script
 * (TODO 5f), so a page that opens one has run something it was handed.
 */
export function watchForErrors(page: Page): ErrorWatch {
  const messages: string[] = [];

  // A console error carries where it came from: "Failed to load resource" names its URL nowhere
  // else, and a refusal a test asked for is forgiven by what was refused.
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const where = message.location()?.url ?? '';
    messages.push(`console: ${message.text()}${where ? ` [${where}]` : ''}`);
  });
  page.on('pageerror', (error) => messages.push(`uncaught: ${error.message}`));
  page.on('dialog', async (dialog) => {
    messages.push(`dialog: ${dialog.type()} '${dialog.message()}'`);
    await dialog.dismiss().catch(() => undefined);
  });
  page.on('requestfailed', (request) => {
    messages.push(`failed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      messages.push(`${response.status()}: ${response.request().method()} ${response.url()}`);
  });

  // A map tile asked without a Referer is refused by OpenStreetMap's tile policy, and the refusal is
  // an "Access blocked" picture sent with status 200: nothing above sees it, and the reader sees a
  // map covered in warnings. A published dashboard sends no referrer at all, so rb-map has to name
  // its origin on the tiles itself.
  // headerValue reads the headers the browser really sent; headers() may leave some out.
  page.on('request', async (request) => {
    if (!/^https:\/\/([a-c]\.)?tile\.openstreetmap\.org\//.test(request.url())) return;
    watch.mapTiles++;
    if (!(await request.headerValue('referer').catch(() => null)))
      messages.push(`map tile asked with no Referer, which OpenStreetMap answers "Access blocked": ${request.url()}`);
  });

  const watch: ErrorWatch = {
    messages,
    mapTiles: 0,
    assertNone(context = 'the page') {
      expect(messages, `${context} met no errors:\n${messages.join('\n')}`).toEqual([]);
    },
  };
  return watch;
}

/**
 * The same watch, for a test that means to be refused: the refusals it asked for are forgiven and
 * everything else still fails.
 */
export function forgive(watch: ErrorWatch, ...parts: string[]): void {
  const kept = watch.messages.filter((one) => !parts.some((part) => one.includes(part)));
  watch.messages.length = 0;
  watch.messages.push(...kept);
}

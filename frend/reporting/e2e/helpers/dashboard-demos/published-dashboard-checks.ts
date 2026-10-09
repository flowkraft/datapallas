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
// (section 9.3). A tile is reached by `rb-<tag>[component-id="…"]`: that
// attribute is the dashboard's own name for the tile, the one its `/data` calls
// use, so it is the widget's identity and not its looks.
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

/** The tag each widget type is drawn by, which is also how many of them a demo must show. */
const TAG_OF: Record<string, string> = {
  number: 'rb-value',
  trend: 'rb-trend',
  gauge: 'rb-gauge',
  progress: 'rb-progress',
  chart: 'rb-chart',
  tabulator: 'rb-tabulator',
  pivot: 'rb-pivot-table',
  map: 'rb-map',
  sankey: 'rb-sankey',
  detail: 'rb-detail',
};

/** The tiles whose reading is a number or a word the reader can see written out. */
const WRITTEN_OUT = ['rb-value', 'rb-trend', 'rb-gauge', 'rb-progress'];

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
  const root = page.locator('rb-dashboard');
  await expect(root, `${reportId} is published and its page opens`).toBeVisible({ timeout: 60_000 });
  return page.locator('body');
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
  await expect(card.locator('rb-dashboard'), `${demo.id} loads when it is scrolled to`)
    .toBeVisible({ timeout: 60_000 });
  return card;
}

/** The credential this dashboard was handed, if it was handed one (a share link's page is). */
export async function embedTokenOf(root: Locator): Promise<string> {
  const dashboard = root.locator('rb-dashboard');
  if ((await dashboard.count()) === 0) return '';
  return (await dashboard.first().getAttribute('embed-token')) ?? '';
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

/** The reader's "ask again": the button under the filters, and the confirmation it asks for. */
export async function reloadDashboard(root: Locator): Promise<void> {
  await root.locator('#btnReloadDashboard').first().click();
  const confirm = root.locator('#btnConfirmReload').first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(confirm, 'the reload was confirmed and the question is gone')
    .toBeHidden({ timeout: 30_000 });
}

/** The values the filter bar of this dashboard is standing on. */
export async function readParams(root: Locator, demo: Demo): Promise<Record<string, string>> {
  const standing: Record<string, string> = {};
  for (const param of declaredParams(demo.id)) {
    const control = root.locator(`#${param.id}`);
    if ((await control.count()) === 0) continue;
    standing[param.id] = await control.evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') return (el as HTMLSelectElement).value;
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        return input.type === 'checkbox' ? String(input.checked) : input.value;
      }
      if (tag === 'div') {
        const picked = el.querySelector('input[type="radio"]:checked') as HTMLInputElement | null;
        return picked ? picked.value : '';
      }
      // A multiselect's trigger says what is picked; the values are its ticked boxes.
      const ticked = Array.from(el.parentElement?.querySelectorAll('input[type="checkbox"]:checked') ?? [])
        .map((one) => (one as HTMLInputElement).value);
      return ticked.join(',');
    });
  }
  return standing;
}

// ── What a tile shows ─────────────────────────────────────────────────────────

/** One tile of this dashboard, by the name its own dashboard calls it. */
export function tileOf(root: Locator, widget: DemoWidget): Locator {
  const tag = TAG_OF[widget.type] ?? 'rb-value';
  return root.locator(`${tag}[component-id="${widget.componentId}"]`);
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
  const token = await embedTokenOf(root);
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
  let answered = rows ?? [];

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
async function writtenReading(tile: Locator, tag: string): Promise<string> {
  if (tag === 'rb-trend') return tile.locator('.rb-trend-inner > div').nth(1).innerText();
  if (tag === 'rb-gauge') return (await tile.locator('svg text').first().textContent()) ?? '';
  if (tag === 'rb-progress') {
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
  const charts = root.locator('rb-chart');
  if ((await charts.count()) === 0) return;
  await expect
    .poll(
      async () =>
        charts.evaluateAll((els) =>
          els.every((el) => {
            const canvas = ((el as any).shadowRoot?.querySelector('canvas')
              || el.querySelector('canvas')) as HTMLCanvasElement | null;
            if (!canvas || !canvas.width || !canvas.height) return false;
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
  const chart = root.locator(`rb-chart[component-id="${componentId}"]`);
  await expect(chart, `${componentId} is a chart of this dashboard`).toHaveCount(1, { timeout: 30_000 });
  return chart.evaluate((el) => {
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
  const dashboard = root.locator('rb-dashboard');
  await expect(dashboard, `${demo.id} is on the page`).toBeVisible({ timeout: 60_000 });

  // The tiles it has, counted by tag: a widget that stopped being exported is a page with a hole
  // in it, and no claim below would notice on its own.
  const widgets = widgetsFor(demo);
  for (const [type, tag] of Object.entries(TAG_OF)) {
    const expected = widgets.filter((w) => w.type === type).length;
    if (expected === 0) continue;
    await expect(root.locator(tag), `${demo.id} shows its ${expected} ${tag} tile(s)`)
      .toHaveCount(expected, { timeout: 60_000 });
  }
  await expect(root.locator('#parameterBarContainer'), `${demo.id} has its own filter bar`)
    .toHaveCount(declaredParams(demo.id).length > 0 ? 1 : 0, { timeout: 30_000 });

  await waitForChartsIn(root);

  // Every data tile has an answer, not a spinner and not a blank.
  for (const widget of widgets) {
    const tag = TAG_OF[widget.type];
    if (!tag) continue;
    const tile = tileOf(root, widget);
    if (WRITTEN_OUT.includes(tag)) {
      await expect
        .poll(async () => (await tile.innerText()).trim(), { timeout: 60_000, intervals: [500] })
        .not.toMatch(/^(\.\.\.|…)?$/);
      continue;
    }
    if (tag === 'rb-tabulator') {
      await expect
        .poll(async () => tile.evaluate((el) => ((el as any).data ?? []).length),
          { timeout: 60_000, intervals: [500] })
        .toBeGreaterThan(0);
      continue;
    }
    if (tag === 'rb-pivot-table' || tag === 'rb-map' || tag === 'rb-sankey' || tag === 'rb-detail') {
      await expect
        .poll(async () => tile.evaluate((el) => el.innerHTML.length + (el.shadowRoot?.innerHTML.length ?? 0)),
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
    const tag = TAG_OF[(widget as DemoWidget).type];
    if (!WRITTEN_OUT.includes(tag) || typeof kpi.value !== 'number') continue;
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
          shown = asNumber((await writtenReading(tile, tag)).trim());
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
    await setParams(root, demo, interaction.changed);
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

// ── Nothing went wrong while all that happened ────────────────────────────────

/** What a page complained about while a test was using it. */
export interface ErrorWatch {
  /** Nothing was logged as an error and nothing failed to load. */
  assertNone(context?: string): void;
  messages: string[];
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

  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(`console: ${message.text()}`);
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

  return {
    messages,
    assertNone(context = 'the page') {
      expect(messages, `${context} met no errors:\n${messages.join('\n')}`).toEqual([]);
    },
  };
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

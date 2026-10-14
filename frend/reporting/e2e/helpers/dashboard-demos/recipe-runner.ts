// ═══════════════════════════════════════════════════════════════════════════════
// recipe-runner.ts
// Does a recipe in the Canvas, the way a person would (section 9.3).
//
// `runRecipe` is the only place that knows which control does which step. Every line below calls a
// helper of `explore-data-test-helper.ts` — it never repeats the chain of one, because the copy
// would drop the helper's guards (waits, the "already open" checks). Where a step had no helper,
// one was added there (TODO 10), next to the ones it is like.
//
// IDS ONLY. A control is reached by its id. The two places that need more are named where they are:
// the widgets' own boxes (`rb-<tag>` picks a widget's type) and react-grid-layout's drag handles.
//
// WHAT IS NOT HERE
//
// Screenshots. A step's optional `shot` is Phase D's; `capture` is the hook it plugs into
// (`build-shots.ts`), called after each step once its result is on screen.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Page } from '@playwright/test';

import {
  addAggregation,
  addComputedColumn,
  addCubeToCanvas,
  addFilterBarParam,
  addFilterBarParamsByForm,
  addGroupBy,
  addTableToCanvas,
  addUIElement,
  addVisualFilter,
  addVisualSort,
  applyCubeSelection,
  bindCubeMember,
  bindVisualFilterToParam,
  getLastWidgetId,
  hideTabulatorColumns,
  layoutWidgetsByDrag,
  publishDashboard,
  runGroovyScript,
  runSqlQuery,
  runVisualQuery,
  setAggregationShare,
  setChartAxes,
  setChartLegend,
  setChartType,
  setChartTitle,
  setColumnTitle,
  setFilterMatch,
  setGaugeConfig,
  setGaugeField,
  setMapConfig,
  setNumberField,
  setNumberFormat,
  setNumberLabel,
  setProgressConfig,
  setSankeyFields,
  setTabulatorOptions,
  setTimeBucket,
  setTrendConfig,
  setVisualLimit,
  setWidgetDsl,
  switchToWidget,
  type WidgetType,
} from '../explore-data-test-helper';
import { assertUniqueIds } from './published-dashboard-checks';
import type { DisplayConfig, FilterParam, Recipe, Step, VisualFilter } from './recipe';

/** `E2E_DD_SCREENSHOTS=1`: the run also takes the "How it was built" pictures (Phase D's `build-shots.ts` plugs into `capture`). */
export function shotsEnabled(): boolean {
  return process.env.E2E_DD_SCREENSHOTS === '1';
}

/** What a run hands back: the dashboard it published. */
export interface RecipeResult {
  reportId: string;
  dashboardUrl: string;
}

export interface RunOptions {
  /** Called after each step, once its result is on screen: Phase D's screenshots plug in here. */
  capture?: (step: Step, index: number) => Promise<void>;
}


/** The widget the last step put on the canvas, which every following step acts on. */
interface Current {
  widgetId: string;
}

/**
 * Do a recipe from a fresh canvas with its connection picked, to the published dashboard.
 *
 * The page must be on that canvas already (`createFreshCanvas` + `selectConnection`): the run starts
 * from the empty canvas the first picture of every "How it was built" page shows.
 */
export async function runRecipe(
  page: Page,
  recipe: Recipe,
  options: RunOptions = {},
): Promise<RecipeResult> {
  const current: Current = { widgetId: '' };
  let published: RecipeResult | undefined;

  for (let index = 0; index < recipe.steps.length; index++) {
    const step = recipe.steps[index];
    if (step.kind === 'publish') {
      published = await doStep(page, step, current, recipe);
    } else {
      await doStep(page, step, current, recipe);
    }
    // A step must never leave an id twice on the page (section 9.3).
    await assertUniqueIds(page.locator('body'));
    if (options.capture) await options.capture(step, index);
  }

  if (!published) throw new Error(`recipe ${recipe.id} never publishes`);
  return published;
}

async function doStep(
  page: Page,
  step: Step,
  current: Current,
  recipe: Recipe,
): Promise<RecipeResult | undefined> {
  switch (step.kind) {
    case 'filters':
      await doFilters(page, step.via, step.params, step.dsl);
      return undefined;

    case 'addElement':
      await addUIElement(page, step.element, step.text === undefined ? undefined : { textContent: step.text });
      if (step.element === 'text') current.widgetId = await getLastWidgetId(page);
      return undefined;

    case 'pickTable':
      await addTableToCanvas(page, step.table);
      current.widgetId = await getLastWidgetId(page);
      return undefined;

    case 'pickCube':
      await addCubeToCanvas(page, step.cubeId);
      current.widgetId = await getLastWidgetId(page);
      return undefined;

    case 'visualQuery':
      await doVisualQuery(page, step.query);
      return undefined;

    case 'cubeFields':
      await doCubeFields(page, step.cube);
      return undefined;

    case 'sql':
      await runSqlQuery(page, step.sql);
      return undefined;

    case 'script':
      await runGroovyScript(page, step.script);
      return undefined;

    case 'visualizeAs':
      await switchToWidget(page, step.widget);
      return undefined;

    case 'displayConfig':
      await doDisplayConfig(page, step.widget, step.config, step.dsl, current);
      // The tile's title, at the top of the Display tab: typed last, so no pasted DSL writes over it.
      if (typeof step.config.widgetTitle === 'string') {
        await page.locator('#btnDisplayTab').click();
        await page.locator('#inputWidgetTitle').fill(step.config.widgetTitle);
      }
      return undefined;

    case 'layout':
      await layoutWidgetsByDrag(page, step.grids);
      return undefined;

    case 'publish':
      return publishDashboard(page);

    default:
      throw new Error(`recipe ${recipe.id}: unknown step ${JSON.stringify(step)}`);
  }
}

// ── The dashboard's filter bar ────────────────────────────────────────────────

async function doFilters(
  page: Page,
  via: 'form' | 'dsl',
  params: FilterParam[],
  dsl: string | undefined,
): Promise<void> {
  if (via === 'dsl') {
    if (!dsl) throw new Error('a filters step through the DSL pane carries its DSL');
    await addFilterBarParam(page, dsl);
    return;
  }
  await addFilterBarParamsByForm(
    page,
    params.map((p) => {
      const hints = (p.uiHints ?? {}) as Record<string, unknown>;
      const options = hints.options;
      return {
        label: String(p.label ?? p.id),
        id: p.id,
        type: p.type,
        widget: (hints.control ?? hints.widget) as string | undefined,
        defaultValue: p.defaultValue === undefined || p.defaultValue === ''
          || (Array.isArray(p.defaultValue) && p.defaultValue.length === 0)
          ? undefined
          : Array.isArray(p.defaultValue) ? p.defaultValue.join(', ') : String(p.defaultValue),
        options: Array.isArray(options) ? (options as unknown[]).join(', ') : (options as string | undefined),
        required: (p.constraints as Record<string, unknown> | undefined)?.required === true ? true : undefined,
      };
    }),
  );
}

// ── A Visual query ────────────────────────────────────────────────────────────

const PARAM_REF = /^\$\{(\w+)\}$/;

async function doVisualQuery(page: Page, query: import('./recipe').VisualQuerySpec): Promise<void> {
  await page.locator('#btnQueryTab-visual').click();
  await page.waitForTimeout(500);

  // Computed columns first: Filter, Summarize and Sort offer them by name.
  for (const [i, c] of (query.computed ?? []).entries()) {
    if ('left' in c) {
      await addComputedColumn(page, i, c.name, c.left, c.operator, c.right);
    } else {
      await page.locator('#btnAddFormula').click();
      await page.locator(`#inputComputedName-${i}`).fill(c.name);
      await page.locator(`#inputComputedFormula-${i}`).fill(c.formula);
      await page.waitForTimeout(300);
    }
  }

  for (const [i, f] of (query.filters ?? []).entries()) await doFilterRow(page, i, f);
  if (query.match === 'any') await setFilterMatch(page, 'any');

  for (const [i, a] of (query.summarize ?? []).entries()) {
    await addAggregation(page, i, a.aggregation.replace(/_/g, ' '), a.field);
    if (a.share) await setAggregationShare(page, i);
  }
  for (const column of query.groupBy ?? []) {
    await addGroupBy(page, column);
    const bucket = query.buckets?.[column];
    if (bucket) await setTimeBucket(page, column, bucket as Parameters<typeof setTimeBucket>[2]);
  }
  for (const [i, s] of (query.sort ?? []).entries()) await addVisualSort(page, i, s.column, s.direction.toUpperCase() as 'ASC' | 'DESC');
  if (query.limit !== undefined) await setVisualLimit(page, query.limit);

  await runVisualQuery(page);
}

/** One filter row: a typed value, or the `${}` chip bound to a dashboard filter; then its switch. */
async function doFilterRow(page: Page, index: number, f: VisualFilter): Promise<void> {
  await doFilterValue(page, index, f);
  if (f.switchParam) {
    await page.locator(`#selectFilterSwitch-${index}`).selectOption(`${f.switchParam}:${f.switchOn ?? 'on'}`);
    await page.waitForTimeout(300);
  }
}

async function doFilterValue(page: Page, index: number, f: VisualFilter): Promise<void> {
  const bound = (v: string | undefined) => (v === undefined ? undefined : PARAM_REF.exec(v)?.[1]);
  const lower = bound(f.value);
  const upper = bound(f.valueTo);

  if (f.operator === 'between') {
    await addVisualFilter(page, index, f.column, 'between');
    if (lower) await bindVisualFilterToParam(page, index, lower, 'value');
    else if (f.value !== undefined) await page.locator(`#inputFilterValue-${index}`).fill(f.value);
    if (upper) await bindVisualFilterToParam(page, index, upper, 'valueTo');
    else if (f.valueTo !== undefined) await page.locator(`#inputFilterValueTo-${index}`).fill(f.valueTo);
    await page.waitForTimeout(300);
    return;
  }
  if (lower) {
    await addVisualFilter(page, index, f.column, f.operator);
    await bindVisualFilterToParam(page, index, lower, 'value');
    return;
  }
  await addVisualFilter(page, index, f.column, f.operator, f.value);
}

// ── A cube widget ─────────────────────────────────────────────────────────────

async function doCubeFields(page: Page, cube: import('./recipe').CubeSpec): Promise<void> {
  await applyCubeSelection(page, {
    dimensions: cube.dimensions,
    measures: cube.measures,
    segments: cube.segments,
    filters: cube.filters,
    granularities: cube.granularities,
    order: cube.order,
    limit: cube.limit,
  });
  for (const [i, b] of (cube.bindings ?? []).entries()) {
    await bindCubeMember(page, i, { member: b.member, operator: b.operator, param: b.param, paramTo: b.paramTo });
  }
}

// ── The Display tab, per widget type ──────────────────────────────────────────

async function doDisplayConfig(
  page: Page,
  widget: WidgetType,
  config: DisplayConfig,
  dsl: string | undefined,
  current: Current,
): Promise<void> {
  switch (widget) {
    case 'number':
      if (config.numberField) await setNumberField(page, String(config.numberField));
      if (config.numberFormat) await setNumberFormat(page, String(config.numberFormat));
      if (config.numberLabel) await setNumberLabel(page, String(config.numberLabel));
      return;

    case 'trend':
      await setTrendConfig(page, {
        date: config.dateField as string | undefined,
        value: config.valueField as string | undefined,
        format: config.format as string | undefined,
        label: config.label as string | undefined,
      });
      return;

    case 'progress':
      await setProgressConfig(page, {
        field: config.field as string | undefined,
        goal: config.goal as number | undefined,
        format: config.format as string | undefined,
        label: config.label as string | undefined,
      });
      return;

    case 'gauge': {
      if (config.field) await setGaugeField(page, String(config.field));
      await setGaugeConfig(page, {
        label: config.label as string | undefined,
        min: config.min as number | undefined,
        max: config.max as number | undefined,
        format: config.gaugeFormat as string | undefined,
        bands: gaugeThresholds(config.gaugeBands),
        higherIsWorse: config.gaugeBandsReverse === true ? true : undefined,
      });
      return;
    }

    case 'map':
      await setMapConfig(page, {
        type: config.mapType as 'region' | 'pin' | 'grid',
        region: config.region as string | undefined,
        // Only a region map has a dimension to pick; a pin or grid map is placed by its coordinates.
        dimension: config.mapType === 'region' ? (config.dimension as string | undefined) : undefined,
        metric: config.metric as string | undefined,
        latField: config.latField as string | undefined,
        lonField: config.lonField as string | undefined,
      });
      return;

    case 'sankey':
      await setSankeyFields(page, {
        source: config.sourceField as string | undefined,
        target: config.targetField as string | undefined,
        value: config.valueField as string | undefined,
      });
      return;

    case 'chart':
      if (dsl) {
        await doChart(page, config);
        await setWidgetDsl(page, dsl);
      } else {
        await doChartByPickers(page, config);
      }
      return;

    case 'tabulator':
      await doTabulator(page, config, current);
      if (dsl) await setWidgetDsl(page, dsl);
      return;

    case 'pivot':
      // A pivot's fields are dragged into its zones (`btnDragPivotSource-<field>` into `pivotZone-<zone>`),
      // or the shipped DSL is pasted where a recipe carries one.
      if (dsl) await setWidgetDsl(page, dsl);
      else await doPivotByPickers(page, config);
      return;

    case 'detail':
      // A Detail's gear ids carry the widget's id in front.
      await doColumnTitles(page, config, (field) => `${current.widgetId}_btnColumnSettings-${field}`);
      return;

    default:
      // text and divider: their content is the step that added them.
      return;
  }
}

/** The three thresholds the Gauge panel edits: a band count other than three repeats the last. */
function gaugeThresholds(bands: unknown): [number, number, number] | undefined {
  if (!Array.isArray(bands) || bands.length === 0) return undefined;
  const tos = (bands as Array<{ to: number }>).map((b) => b.to);
  while (tos.length < 3) tos.push(tos[tos.length - 1]);
  return [tos[0], tos[1], tos[2]];
}

/**
 * A chart: its type, its X axis, its first Y axis, its title and legend, through the pickers. The
 * pickers write `datasets[].label = field` and cannot name a second series or a bubble size, so
 * the step after this one (`dsl`) says the whole chart in the DSL pane.
 */
async function doChart(page: Page, config: DisplayConfig): Promise<void> {
  const dsl = (config.dslConfig ?? {}) as {
    type?: string;
    data?: { labelField?: string; datasets?: Array<{ field: string }> };
    options?: { plugins?: { title?: { text?: string }; legend?: { display?: boolean } } };
  };
  if (dsl.type) await setChartType(page, dsl.type);
  const x = dsl.data?.labelField;
  const y = dsl.data?.datasets?.[0]?.field;
  if (x !== undefined || y !== undefined) await setChartAxes(page, { x, y });
  if (dsl.options?.plugins?.title?.text) await setChartTitle(page, dsl.options.plugins.title.text);
  if (dsl.options?.plugins?.legend?.display === false) await setChartLegend(page, 'hide');
}

/**
 * A chart said by the pickers alone, with no DSL pasted after them: what `doChart` sets, then the
 * series breakout, every measure with its name, draw type and axis, data labels, stacking, the
 * value axis' ends, top N, number format, palette and clicks. A setting the chart does not have is
 * left as the pickers leave it.
 */
async function doChartByPickers(page: Page, config: DisplayConfig): Promise<void> {
  type Dataset = { field: string; label?: string; type?: string; yAxisID?: string };
  const dsl = (config.dslConfig ?? {}) as {
    type?: string;
    palette?: string;
    clicksFilter?: boolean;
    data?: { labelField?: string; seriesField?: string; datasets?: Dataset[] };
    options?: {
      plugins?: { rbValueLabels?: { display?: boolean }; legend?: { display?: boolean } };
      scales?: Record<string, { stacked?: boolean; min?: number; max?: number }>;
      rbStack100?: boolean;
      rbTopN?: number;
      rbNumberFormat?: string;
    };
  };
  await doChart(page, config);
  await page.locator('#btnDisplayTab').click();

  // The measures and their names first: a series breakout hides the name boxes (its series are
  // named by its values), and a name typed before it stays in the chart.
  const datasets = dsl.data?.datasets ?? [];
  for (const [i, d] of datasets.entries()) {
    if (i > 0) {
      await page.locator('#btnAddChartYAxis').click();
      await page.locator(`#selectChartYAxis-${i}`).selectOption(d.field);
    }
    // A measure is named after its column until a name is typed; an empty box takes the name away.
    // A breakout (the Canvas makes one of a second group column by itself) hides the box.
    const name = page.locator(`#inputChartSeriesLabel-${i}`);
    if (await name.isVisible()) await name.fill(d.label ?? '');
    if (d.type !== undefined) await chooseWritten(page, `#selectChartSeriesType-${i}`, d.type);
    if (d.yAxisID === 'y1') await page.locator(`#chkChartSeriesRightAxis-${i}`).check();
  }
  const series = dsl.data?.seriesField;
  if (series) {
    await page.locator('#btnAddChartXAxis').click();
    await page.locator('#selectChartXAxis-1').selectOption(series);
  }
  if (dsl.options?.plugins?.legend?.display === true) await page.locator('#btnChartLegend-show').click();
  if (dsl.options?.plugins?.rbValueLabels?.display === true) await page.locator('#btnChartLabels-on').click();
  if (dsl.options?.rbStack100 === true) await page.locator('#btnChartStacked-percent').click();
  else if (dsl.options?.scales?.y?.stacked === true || dsl.options?.scales?.x?.stacked === true) {
    await page.locator('#btnChartStacked-on').click();
  }
  const valueAxis = dsl.type === 'row' ? 'x' : 'y';
  const ends = dsl.options?.scales?.[valueAxis];
  if (ends?.min !== undefined) await page.locator('#inputChartAxisMin').fill(String(ends.min));
  if (ends?.max !== undefined) await page.locator('#inputChartAxisMax').fill(String(ends.max));
  if (dsl.options?.rbTopN !== undefined) {
    await page.locator('#inputChartTopN').fill(String(dsl.options.rbTopN));
    await page.locator('#inputChartTopN').press('Enter');
  }
  if (dsl.options?.rbNumberFormat) await page.locator('#selectChartNumberFormat').selectOption(dsl.options.rbNumberFormat);
  if (dsl.palette) await page.locator(`#btnChartPalette-${dsl.palette}`).click();
  if (dsl.clicksFilter === true) await page.locator('#chkChartClicksFilter').check();
  await page.waitForTimeout(500);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/**
 * A choice made so the widget writes it down: a select already showing the wanted value writes
 * nothing when it is picked again, so another value is picked first.
 */
async function chooseWritten(page: Page, selector: string, value: string): Promise<void> {
  const select = page.locator(selector);
  if ((await select.inputValue()) === value) {
    const other = await select.locator('option').evaluateAll(
      (options, wanted) => options.map((o) => (o as HTMLOptionElement).value).find((v) => v !== wanted),
      value,
    );
    if (other !== undefined) await select.selectOption(other);
  }
  await select.selectOption(value);
}

/** Drag a field chip into a pivot zone (`rows`, `cols`, `vals`) with the mouse, as a person does. */
async function dragPivotField(page: Page, field: string, zone: 'rows' | 'cols' | 'vals'): Promise<void> {
  await dragPivotChip(page, field, zone);
  await page.locator(`[id="btnDragPivotField-${field}"]`).waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * The drag itself, from a field chip (available or placed) to a pivot zone, `available` included:
 * what the drop does is the caller's to check (canvas mechanics also drops where a field is refused).
 */
export async function dragPivotChip(page: Page, field: string, zone: 'rows' | 'cols' | 'vals' | 'available'): Promise<void> {
  const chip = page.locator(`[id="btnDragPivotSource-${field}"], [id="btnDragPivotField-${field}"]`).first();
  const target = page.locator(`[id="pivotZone-${zone}"]`);
  await chip.waitFor({ state: 'visible', timeout: 10_000 });
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  // A mouse cannot press below the window: with many fields the chip sits under the fold, so it is
  // scrolled up first, and the zone it goes to must still be on screen with it.
  await target.scrollIntoViewIfNeeded();
  await chip.scrollIntoViewIfNeeded();
  const from = await chip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error(`cannot drag ${field} to ${zone}: a box is missing`);
  const height = page.viewportSize()?.height ?? Infinity;
  for (const [what, box] of [[field, from], [zone, to]] as const) {
    if (box.y < 0 || box.y + box.height > height)
      throw new Error(`cannot drag ${field} to ${zone}: ${what} is off screen (y ${box.y}, window ${height})`);
  }
  // dnd-kit's pointer sensor needs a real press, a few moves and a release.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  // dnd-kit scrolls the panel while the pointer is near one of its edges, so the zone may have moved
  // under the pointer on the way (a field let go over the next zone, which refuses it): the release
  // follows the zone to where it stands still.
  let at = to;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(100);
    const now = await target.boundingBox();
    if (!now || (Math.abs(now.x - at.x) < 1 && Math.abs(now.y - at.y) < 1)) break;
    at = now;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2, { steps: 3 });
  }
  await page.mouse.up();
}

/**
 * A pivot said by its panel, with no DSL pasted: every field back to the available list, then
 * dragged into its zone in order, then the aggregation, the renderer, both totals and both axis
 * orders, each written down as the shipped one says it.
 */
async function doPivotByPickers(page: Page, config: DisplayConfig): Promise<void> {
  const dsl = (config.dslConfig ?? {}) as {
    rows?: string[]; cols?: string[]; vals?: string[]; aggregatorName?: string; rendererName?: string;
    rowOrder?: string; colOrder?: string; rowTotals?: boolean; colTotals?: boolean;
  };
  await page.locator('#btnDisplayTab').click();
  await page.locator('#configPanel-pivot').waitFor({ state: 'visible', timeout: 10_000 });
  // Switching to a pivot lays the fields out by itself.
  const assigned = page.locator('[id^="btnRemovePivotField-"]');
  for (let left = await assigned.count(); left > 0; left = await assigned.count()) {
    await assigned.first().click();
    await page.waitForTimeout(300);
  }
  for (const zone of ['rows', 'cols', 'vals'] as const) {
    for (const field of dsl[zone] ?? []) await dragPivotField(page, field, zone);
  }
  if (dsl.aggregatorName) await chooseWritten(page, '#selectPivotAggregation', dsl.aggregatorName);
  if (dsl.rendererName) await chooseWritten(page, '#selectPivotRenderer', dsl.rendererName);
  for (const [key, id] of [['rowTotals', '#chkPivotRowTotals'], ['colTotals', '#chkPivotColTotals']] as const) {
    const want = dsl[key];
    if (want === undefined) continue;
    // Unticked and ticked again, so the panel writes the setting even where it is the default.
    await page.locator(id).setChecked(!want);
    await page.locator(id).setChecked(want);
  }
  // The axis order cycles: none, A to Z, Z to A.
  for (const [key, zone] of [['rowOrder', 'rows'], ['colOrder', 'cols']] as const) {
    const clicks = dsl[key] === 'key_a_to_z' ? 1 : dsl[key] === 'key_z_to_a' ? 2 : 0;
    for (let i = 0; i < clicks; i++) await page.locator(`#btnPivotSortAxis-${zone}`).click();
  }
  await page.waitForTimeout(500);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** A Tabulator: layout, pagination, rows per page, theme, hidden columns, column titles. */
async function doTabulator(page: Page, config: DisplayConfig, current: Current): Promise<void> {
  const dsl = (config.dslConfig ?? {}) as {
    layout?: string; pagination?: boolean; paginationSize?: number; theme?: string;
    autoColumnsDefinitions?: Array<{ field: string; visible?: boolean }>;
  };
  await setTabulatorOptions(page, {
    layout: dsl.layout,
    pagination: dsl.pagination,
    pageSize: dsl.pagination === false ? undefined : dsl.paginationSize,
    theme: dsl.theme,
  });
  const hidden = (dsl.autoColumnsDefinitions ?? []).filter((d) => d.visible === false).map((d) => d.field);
  if (hidden.length > 0) await hideTabulatorColumns(page, hidden);
  await doColumnTitles(page, config, (field) => `btnColumnSettings-${current.widgetId}-${field}`);
}

/** Every `columnTitle` of a Tabulator or Detail, through the gear next to its column. */
async function doColumnTitles(
  page: Page,
  config: DisplayConfig,
  gearIdOf: (field: string) => string | Promise<string>,
): Promise<void> {
  const settings = (config.columnSettings ?? {}) as Record<string, { columnTitle?: string }>;
  for (const [field, s] of Object.entries(settings)) {
    if (s.columnTitle) await setColumnTitle(page, await gearIdOf(field), s.columnTitle);
  }
}

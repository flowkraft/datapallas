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
        type: p.type,
        widget: (hints.control ?? hints.widget) as string | undefined,
        defaultValue: p.defaultValue === undefined || p.defaultValue === '' ? undefined : String(p.defaultValue),
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
    await addComputedColumn(page, i, c.name, c.left, c.operator, c.right);
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

/** One filter row: a typed value, or the `${}` chip bound to a dashboard filter. */
async function doFilterRow(page: Page, index: number, f: VisualFilter): Promise<void> {
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
        dimension: config.dimension as string | undefined,
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
      await doChart(page, config);
      if (dsl) await setWidgetDsl(page, dsl);
      return;

    case 'tabulator':
      await doTabulator(page, config, current);
      if (dsl) await setWidgetDsl(page, dsl);
      return;

    case 'pivot':
      // The pivot's fields are dragged between zones that carry no ids of their own; the Display
      // tab's DSL pane says the same thing in words, so that is the path (recipe-runner's one DSL-only widget).
      if (!dsl) throw new Error('a pivot step carries its DSL');
      await setWidgetDsl(page, dsl);
      return;

    case 'detail':
      // A Detail's gear ids carry the widget's component id in front.
      await doColumnTitles(page, config, async (field) =>
        (await page.locator(`[id$="btnColumnSettings-${field}"]`).first().getAttribute('id')) ?? '');
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

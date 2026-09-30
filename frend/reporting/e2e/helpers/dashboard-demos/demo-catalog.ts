// ═══════════════════════════════════════════════════════════════════════════════
// demo-catalog.ts
// The 25 Dashboard Demos, read from the files the product ships (section 9.3).
//
// WHAT IS TRUE, AND WHERE IT COMES FROM
//
// Nothing here states a number, a title or a widget. The demos are
// `config/samples/dashboard-demos.json`, the same index the Gallery's cards are
// generated from; each demo's widgets and filters are its own
// `g-<id>.canvas.json`, the file that was published; and the values every tile
// must show are `e2e/dashboard-demos/checks/<nn>-<id>.checks.json`, the same
// files the Java loop (`DashboardDemosQueriesTest`) holds the assembled
// dashboards to. So the e2e and the JUnit check the same claims of the same
// widgets, and a demo changed later is walked with no new e2e.
//
// The shipped files are read where they are. Nothing here is a copy of them.
// ═══════════════════════════════════════════════════════════════════════════════

import { canvasComponentId, type WidgetState } from '../dashboard-test-helper';

const fs = require('fs');
const path = require('path');

import { E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH } from '../../utils/paths';

// ── Where things are ──────────────────────────────────────────────────────────

/** The Gallery: one page, and the 25 demos on it. */
export const GALLERY_REPORT_ID = 'g-dashboard-demos';

/** A shipped dashboard that is on no Gallery card, so a Gallery credential must refuse it. */
export const NOT_ON_THE_GALLERY = 'g-cube-stories';

/** The connection the demo data lives on: `dash_demo` is a schema of the DuckDB Northwind sample. */
export const DASH_DEMO_CONNECTION = 'rbt-sample-northwind-duckdb-4f2';

const SAMPLES_PATH = path.join(
  E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
  'db-template/config/samples',
);

const INDEX_PATH = path.join(SAMPLES_PATH, 'dashboard-demos.json');

const CHECKS_PATH = 'e2e/dashboard-demos/checks';

const SEED_SCRIPT_PATH = path.join(
  E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
  'db-template/db/scripts/dashboards-demo-data.groovy',
);

// ── What a demo is ────────────────────────────────────────────────────────────

/**
 * One demo, exactly as the index declares it (section 7).
 *
 * `nn` is its place in the Gallery, which is also the number its widget ids carry
 * (`w-dd04-…`) and the number its checks file is named after, and `reportId` is `g-` + `id`.
 */
export interface Demo {
  nn: number;
  id: string;
  reportId: string;
  area: string;
  title: string;
  question: string;
  who: string;
  decision: string;
  finding: string;
  heightPx: number;
  howItWasBuiltUrl: string;
}

/** One claim about one tile: the value a reader must see, and how that value is read off it. */
export interface Kpi {
  widget: string;
  label?: string;
  format?: string;
  value: unknown;
  /** `rows`, `distinct`, `argmax`, `mean`, or absent for "the tile's own reading". */
  reading?: string;
  column?: string;
  row?: Record<string, unknown>;
  labels?: string[];
  sql?: string;
}

/** One thing a reader does: the filters it leaves the dashboard on, and what the tiles then say. */
export interface Interaction {
  id: string;
  params: Record<string, unknown>;
  changed: Record<string, unknown>;
  kpis: Kpi[];
}

/** One density guarantee: how many rows the smallest bucket of a widget's own grouping holds. */
export interface Density {
  widget: string;
  bucket: string;
  threshold: number;
  observed: number;
  rule?: string;
  over?: string;
  short?: boolean;
  aboutTheData?: boolean;
  sql?: string;
}

/** A demo's checks file: what it opens with, what its tiles show, and what changes when. */
export interface DemoChecks {
  id: string;
  index: number;
  title: string;
  dataToday: string;
  seed: { script: string; wipe: boolean; today: string };
  defaults: Record<string, unknown>;
  kpis: Kpi[];
  interactions: Interaction[];
  density: Density[];
}

/** One question the dashboard was written to answer, with the filters that answer it. */
export interface Story {
  id: string;
  question: string;
  text: string;
  params: Record<string, unknown>;
  check: string;
}

/** One filter of a dashboard, as its canvas declares it and `rb-parameters` draws it. */
export interface ParamMeta {
  id: string;
  type?: string;
  label?: string;
  defaultValue?: unknown;
  constraints?: Record<string, unknown>;
  uiHints?: { control?: string; widget?: string; options?: unknown };
}

/** One widget of a canvas, with the name its published dashboard reports it under. */
export interface DemoWidget {
  /** The canvas id, `w-dd04-revenue`. */
  id: string;
  /** What the checks call it: the id without this demo's prefix, `revenue`. */
  key: string;
  type: string;
  componentId: string;
  displayConfig: Record<string, unknown>;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

// ── The catalogue ─────────────────────────────────────────────────────────────

/**
 * The 25 demos, in the order the Gallery shows them.
 *
 * Read once, from the index the Gallery itself is generated from — so a demo renamed, moved to
 * another area or given another height is one edit, in the product, and every test here follows it.
 */
export const DEMOS: Demo[] = (readJson<{ demos: Demo[] }>(INDEX_PATH).demos ?? []).map((demo) => ({
  ...demo,
}));

/** One demo by its id (`dd-sales-overview`) or by its report id (`g-dd-sales-overview`). */
export function demoOf(id: string): Demo {
  const wanted = id.replace(/^g-/, '');
  const demo = DEMOS.find((d) => d.id === wanted);
  if (!demo) throw new Error(`no demo '${id}' in ${INDEX_PATH}; there are ${DEMOS.length}`);
  return demo;
}

/** The checks of one demo: the file its number and its id name. */
export function loadChecks(id: string): DemoChecks {
  const demo = demoOf(id);
  const file = path.join(CHECKS_PATH, `${pad(demo.nn)}-${demo.id}.checks.json`);
  return readJson<DemoChecks>(file);
}

/** The canvas a demo was published from, as it ships. */
export function loadCanvas(id: string): Record<string, any> {
  const demo = demoOf(id);
  return readJson<Record<string, any>>(
    path.join(SAMPLES_PATH, demo.reportId, `${demo.reportId}.canvas.json`),
  );
}

/** The questions a demo offers a reader, from the stories file its dashboard serves in its config. */
export function loadStories(id: string): Story[] {
  const demo = demoOf(id);
  const file = path.join(SAMPLES_PATH, demo.reportId, `${demo.reportId}-stories.json`);
  if (!fs.existsSync(file)) return [];
  return readJson<Story[]>(file);
}

/** The Gallery's own page, the file the product ships and the server publishes. */
export function galleryTemplate(): string {
  return fs.readFileSync(
    path.join(SAMPLES_PATH, GALLERY_REPORT_ID, `${GALLERY_REPORT_ID}-template.html`),
    'utf8',
  );
}

/** The seed the demo data comes from, read as a script to send, never re-written here. */
export function dashDemoSeedScript(): string {
  return fs.readFileSync(SEED_SCRIPT_PATH, 'utf8');
}

// ── A demo's widgets and filters ──────────────────────────────────────────────

/**
 * Every widget of a demo, with the two names it has: the canvas id, and the `component-id` its
 * published template and its `/data` answers use (`canvasComponentId`, the product's own formula).
 *
 * `key` is the third name, the one the checks write: the id without this demo's prefix. The prefix
 * is the demo's number, exactly as `DashboardDemos.Demo.widgetPrefix()` builds it, so a claim about
 * `revenue` and the widget `w-dd04-revenue` cannot drift apart.
 */
export function widgetsOf(id: string): DemoWidget[] {
  const demo = demoOf(id);
  const prefix = widgetPrefix(demo);
  const widgets = (loadCanvas(id).state?.widgets ?? []) as WidgetState[];
  return widgets.map((w) => ({
    id: w.id,
    key: w.id.startsWith(prefix) ? w.id.substring(prefix.length) : w.id,
    type: w.type,
    componentId: canvasComponentId(w),
    displayConfig: (w.displayConfig ?? {}) as Record<string, unknown>,
  }));
}

/** The widget a claim names. */
export function widgetOf(id: string, key: string): DemoWidget {
  const widget = widgetsOf(id).find((w) => w.key === key);
  if (!widget)
    throw new Error(
      `${id} has no widget '${key}'; it has ${widgetsOf(id).map((w) => w.key).join(', ')}`,
    );
  return widget;
}

/** The prefix every widget id of a demo carries: `w-dd04-`. */
export function widgetPrefix(demo: Demo): string {
  return `w-dd${pad(demo.nn)}-`;
}

/**
 * The filters a demo declares, in the order its bar draws them.
 *
 * A checks file's `params` can name more than these: a value a claim's SQL needs that no reader ever
 * picks (`yearLabel`, the label of the year they picked) is part of the claim, not of the dashboard.
 * So what a test sets, and what it asks `/data` for, is what this returns.
 */
export function declaredParams(id: string): ParamMeta[] {
  const config = loadCanvas(id).state?.parametersConfig;
  return ((config?.parameters ?? []) as ParamMeta[]).filter((p) => !!p?.id);
}

/** The subset of a claim's params this dashboard really has a filter for. */
export function paramsItDeclares(
  id: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const declared = new Set(declaredParams(id).map((p) => p.id));
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params ?? {})) if (declared.has(name)) kept[name] = value;
  return kept;
}

/** A demo's number as its files write it: `4` is `04`. */
export function pad(nn: number): string {
  return String(nn).padStart(2, '0');
}

/** The query string a `/data` call carries for a set of filter values. */
export function asQuery(params: Record<string, unknown>): string {
  return Object.entries(params ?? {})
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(asText(value))}`)
    .join('&');
}

/** A filter value as a URL and a control both write it: a list is its values, comma separated. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((one) => String(one)).join(',');
  return String(value);
}

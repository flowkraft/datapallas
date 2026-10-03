// ═══════════════════════════════════════════════════════════════════════════════
// canvas-parity.ts
// Is the canvas a recipe built the canvas that ships? (section 9.4)
//
// `normalizeCanvas` reduces a canvas — the shipped `*.canvas.json`, or what the server saved for the
// rebuilt one — to what a person's choices decide. `assertSameCanvas` compares the two and, when
// they differ, says which widget and which setting, in the order the Canvas shows them.
//
// WIDGETS ARE MATCHED BY ORDER AND TYPE. The rebuilt widgets get new ids, so ids are never compared;
// the Nth widget of each side must be the same type, and then everything below it must agree.
//
// WHAT IS LEFT OUT, AND WHY (each is a line in KNOWN_GAPS or in `normalizeWidget`)
//
//   ids, `queryResults`, `selectedWidgetId`, `editMode`, `filterValues`, versions, `columns`, `shape`:
//     the state of the session, not a choice.
//   A SQL / script widget's leftover Visual query: it started on a table, the query replaced it.
//   `generatedSql` whitespace: the builder's text, compared with its blanks collapsed.
//   A param's `control` / `widget`: the shipped files say `control`, the dialog writes `widget`;
//     ShareDialog reads `control ?? widget`, so they are one setting.
//   `required: false`, a `[]` default and a default compared as text: the same value written two ways.
//   Tabulator `autoColumns: true` / `pagination: true`: the widget's defaults, written only once a
//     picker has touched them.
//   `columnSettings`: only `columnTitle` is compared (a cube seeds number formats of its own).
// ═══════════════════════════════════════════════════════════════════════════════

import { expect } from '@playwright/test';

type Json = Record<string, any>;

/**
 * What the Canvas cannot say today. Each entry is a FINDING the run reports, not a hole in the
 * test: the shipped canvas holds a value for which the Canvas has no control, so the rebuilt one
 * cannot. The entry names the setting; the comparison then skips exactly that and nothing else.
 */
export const KNOWN_GAPS: ReadonlyArray<{
  /** The widget type the gap is on. */
  widget: string;
  /** The key of `displayConfig` left out of the comparison. */
  key: string;
  /** Why the Canvas cannot set it. */
  why: string;
  /** When set, only the keys inside `key` listed here are left out (a band's colour, not its limit). */
  only?: (cfg: Json) => boolean;
}> = [
  { widget: 'number', key: 'numberDecimals', why: 'no Canvas control sets decimals and no AI Hub code reads them' },
  { widget: 'sankey', key: 'label', why: 'the Sankey panel has no label input' },
  {
    widget: 'gauge',
    key: 'gaugeBands',
    why: 'the Gauge panel has three bands in fixed colours; only their limits are editable',
    only: (cfg) => !bandsAreThreeDefaults(cfg.gaugeBands),
  },
];

/** The colours of the Gauge panel's three fixed bands, low to high. */
const DEFAULT_BAND_COLOURS = ['#ef8c8c', '#f9d45c', '#88bf4d'];
function bandsAreThreeDefaults(bands: unknown): boolean {
  return Array.isArray(bands) && bands.length === DEFAULT_BAND_COLOURS.length
    && bands.every((b, i) => b && b.color === DEFAULT_BAND_COLOURS[i]);
}

// ── Reading a canvas ──────────────────────────────────────────────────────────

/** The state of a canvas, whichever way it comes: `{state: {...}}`, `{state: "…json…"}` or the state itself. */
export function stateOf(canvas: Json): Json {
  const s = canvas.state ?? canvas;
  return typeof s === 'string' ? JSON.parse(s) : s;
}

const collapse = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);

function normalizeParam(p: Json): Json {
  const hints: Json = { ...(p.uiHints ?? {}) };
  if (hints.control === undefined && hints.widget !== undefined) hints.control = hints.widget;
  delete hints.widget;
  const constraints: Json = { ...(p.constraints ?? {}) };
  if (constraints.required === false) delete constraints.required;
  let def = p.defaultValue;
  if (Array.isArray(def) && def.length === 0) def = undefined;
  if (def === '' || def === null) def = undefined;
  const out: Json = {
    id: p.id,
    type: p.type,
    label: p.label,
    defaultValue: def === undefined ? undefined : Array.isArray(def) ? def.map(String) : String(def),
    constraints,
    uiHints: hints,
  };
  return stripUndefined(out);
}

function stripUndefined(o: any): any {
  if (Array.isArray(o)) return o.map(stripUndefined);
  if (o && typeof o === 'object') {
    const r: Json = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = stripUndefined(v);
    return r;
  }
  return o;
}

function normalizeDataSource(ds: Json | null | undefined): Json | null {
  if (!ds) return null;
  // A SQL or script widget started on a table and keeps that table's leftovers in a Visual query
  // it no longer reads; what it answers with is its `sql` / `script`, so only that is compared.
  if (ds.mode === 'sql') return stripUndefined({ mode: 'sql', sql: collapse(ds.sql) });
  if (ds.mode === 'script') return stripUndefined({ mode: 'script', script: String(ds.script).replace(/\r\n/g, '\n').trim() });
  const out: Json = { ...ds };
  if (out.generatedSql !== undefined) out.generatedSql = collapse(out.generatedSql);
  if (out.sql !== undefined) out.sql = collapse(out.sql);
  if (out.script !== undefined) out.script = String(out.script).replace(/\r\n/g, '\n').trim();
  const vq = out.visualQuery;
  if (vq) {
    out.visualQuery = {
      ...vq,
      aggregations: undefined,
      summarize: (vq.summarize ?? []).map((a: Json) => ({ ...a, aggregation: String(a.aggregation).replace(/ /g, '_') })),
      groupBy: vq.groupBy ?? [],
      sort: (vq.sort ?? []).map((x: Json) => ({ ...x, direction: String(x.direction).toUpperCase() })),
      filters: vq.filters ?? [],
    };
  }
  return stripUndefined(out);
}

function normalizeDisplay(type: string, cfg: Json | null | undefined): Json {
  const out: Json = { ...(cfg ?? {}) };
  for (const gap of KNOWN_GAPS) {
    if (gap.widget === type && (!gap.only || gap.only(out))) delete out[gap.key];
  }
  if (out.columnSettings) {
    const titles: Json = {};
    for (const [field, s] of Object.entries<Json>(out.columnSettings)) {
      if (s && s.columnTitle !== undefined) titles[field] = { columnTitle: s.columnTitle };
    }
    out.columnSettings = titles;
    if (Object.keys(titles).length === 0) delete out.columnSettings;
  }
  const dsl = out.dslConfig;
  if (type === 'tabulator' && dsl) {
    const d: Json = { ...dsl };
    if (d.autoColumns === true) delete d.autoColumns;
    if (d.pagination === true) delete d.pagination;
    out.dslConfig = d;
  }
  return stripUndefined(out);
}

export interface NormalWidget {
  type: string;
  grid: { x: number; y: number; w: number; h: number };
  dataSource: Json | null;
  display: Json;
}

export interface NormalCanvas {
  name: string;
  params: Json[];
  widgets: NormalWidget[];
}

export function normalizeCanvas(canvas: Json): NormalCanvas {
  const st = stateOf(canvas);
  return {
    name: String(st.name ?? canvas.name ?? ''),
    params: ((st.parametersConfig?.parameters ?? []) as Json[]).map(normalizeParam),
    widgets: ((st.widgets ?? []) as Json[]).map((w) => ({
      type: w.type,
      grid: { x: w.gridPosition.x, y: w.gridPosition.y, w: w.gridPosition.w, h: w.gridPosition.h },
      dataSource: normalizeDataSource(w.dataSource),
      display: normalizeDisplay(w.type, w.displayConfig),
    })),
  };
}

// ── Comparing two ─────────────────────────────────────────────────────────────

/** Every difference between two normalised values as `path: shipped ≠ rebuilt`. */
function diffs(a: any, b: any, at: string, out: string[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffs(a[k], b[k], `${at}.${k}`, out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((v, i) => diffs(v, b[i], `${at}[${i}]`, out));
    return;
  }
  out.push(`${at}: shipped ${JSON.stringify(a)} ≠ rebuilt ${JSON.stringify(b)}`);
}

/** The differences between the shipped canvas and the rebuilt one, in the order the Canvas shows them. */
export function canvasDifferences(rebuilt: Json, shipped: Json): string[] {
  const r = normalizeCanvas(rebuilt);
  const s = normalizeCanvas(shipped);
  const out: string[] = [];
  diffs(s.params, r.params, 'filters', out);
  if (s.widgets.length !== r.widgets.length) {
    out.push(`widgets: shipped ${s.widgets.length} (${s.widgets.map((w) => w.type).join(', ')}) ≠ rebuilt ${r.widgets.length} (${r.widgets.map((w) => w.type).join(', ')})`);
  }
  for (let i = 0; i < Math.min(s.widgets.length, r.widgets.length); i++) {
    const at = `widget ${i + 1} (${s.widgets[i].type})`;
    if (s.widgets[i].type !== r.widgets[i].type) {
      out.push(`${at}: shipped type ${s.widgets[i].type} ≠ rebuilt ${r.widgets[i].type}`);
      continue;
    }
    diffs(s.widgets[i].grid, r.widgets[i].grid, `${at}.grid`, out);
    diffs(s.widgets[i].dataSource, r.widgets[i].dataSource, `${at}.dataSource`, out);
    diffs(s.widgets[i].display, r.widgets[i].display, `${at}.display`, out);
  }
  return out;
}

/** Fail with the list of differences, or pass when the rebuilt canvas is the shipped one. */
export function assertSameCanvas(rebuilt: Json, shipped: Json): void {
  const found = canvasDifferences(rebuilt, shipped);
  expect(found, `the rebuilt canvas differs from the shipped one:\n  ${found.join('\n  ')}\n`).toEqual([]);
}

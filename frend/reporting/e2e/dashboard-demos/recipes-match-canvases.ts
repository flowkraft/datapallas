// ═══════════════════════════════════════════════════════════════════════════════
// recipes-match-canvases.ts
// A recipe says every widget, source, setting and grid position of its canvas (TODO 11).
//
// This is the by-reading check of that claim, done by a program so it is done for all 25 every
// time and not once by eye: it reads each recipe and the shipped `.canvas.json` and fails on the
// first thing the canvas has that no step says, or a step says that the canvas does not have.
// It never opens a browser. Run it with the dashboard-demos helpers' own toolchain:
//
//   npx tsx e2e/dashboard-demos/recipes-match-canvases.ts
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';

import { DEMOS, loadCanvas } from '../helpers/dashboard-demos/demo-catalog';
import type { Recipe, Step } from '../helpers/dashboard-demos/recipe';

type Json = Record<string, any>;
const problems: string[] = [];
const fail = (demo: string, what: string) => problems.push(`${demo}: ${what}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A visual query written the way the canvas stores it, from what the recipe says. */
function visualQueryOf(table: string, q: Json): Json {
  const [tableSchema, name] = table.split('.');
  const out: Json = { table: name, tableSchema };
  out.filters = (q.filters ?? []).map((f: Json) => ({
    column: f.column, operator: f.operator, value: f.value, ...(f.valueTo !== undefined ? { valueTo: f.valueTo } : {}),
  }));
  out.summarize = (q.summarize ?? []).map((a: Json) => ({ aggregation: a.aggregation, field: a.field, ...(a.share ? { share: true } : {}) }));
  out.groupBy = q.groupBy ?? [];
  out.sort = q.sort ?? [];
  out.limit = q.limit ?? 500;
  if (q.buckets) out.groupByBuckets = q.buckets;
  if (q.computed) out.computed = q.computed;
  return out;
}

function check(recipe: Recipe, canvas: Json): void {
  const id = recipe.id;
  const st = canvas.state;
  const widgets: Json[] = st.widgets;

  // The filter bar: the same filter ids, and nothing else on the bar.
  const filters = recipe.steps.filter((s): s is Extract<Step, { kind: 'filters' }> => s.kind === 'filters');
  const wanted: string[] = (st.parametersConfig?.parameters ?? []).map((p: Json) => p.id);
  if (wanted.length === 0 && filters.length > 0) fail(id, 'it has filters the canvas does not');
  if (wanted.length > 0) {
    if (filters.length !== 1) fail(id, `${wanted.length} filters need exactly one filters step, it has ${filters.length}`);
    else {
      const said = [...(filters[0].dsl ?? '').matchAll(/parameter\(\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
      if (!same(said, wanted)) fail(id, `filters say ${JSON.stringify(said)}, the canvas has ${JSON.stringify(wanted)}`);
    }
  }

  // Walk the steps; each widget is a run that starts with a step that puts it on the canvas.
  let n = -1;
  let seen: { visualized?: string; configured?: boolean } = {};
  const closeWidget = () => {
    if (n < 0) return;
    const w = widgets[n];
    if (w.type !== 'text' && w.type !== 'divider' && seen.visualized !== w.type)
      fail(id, `widget ${n + 1} (${w.id}) is a ${w.type}, the recipe shows it as ${seen.visualized}`);
  };
  for (const step of recipe.steps) {
    switch (step.kind) {
      case 'addElement': case 'pickTable': case 'pickCube': {
        // A table/cube step after the first of a widget would be a second widget; the sql/script
        // widgets start on a table too, so each of these three is exactly one canvas widget.
        closeWidget();
        n++; seen = {};
        const w = widgets[n];
        if (!w) { fail(id, `step ${step.kind} ${step.key} has no canvas widget`); return; }
        if (w.id !== step.key) fail(id, `widget ${n + 1} is ${w.id}, the recipe's is ${step.key}`);
        if (!same(step.grid, w.gridPosition)) fail(id, `${w.id}: grid ${JSON.stringify(step.grid)} ≠ canvas ${JSON.stringify(w.gridPosition)}`);
        if (step.kind === 'addElement') {
          if (step.element !== w.type) fail(id, `${w.id}: element ${step.element} ≠ ${w.type}`);
          if (step.element === 'text' && step.text !== w.displayConfig.textContent) fail(id, `${w.id}: text differs`);
        }
        if (step.kind === 'pickCube' && step.cubeId !== w.dataSource?.visualQuery?.cubeId) fail(id, `${w.id}: cube ${step.cubeId}`);
        if (step.kind === 'pickTable' && w.dataSource.mode === 'visual') {
          const vq = w.dataSource.visualQuery;
          if (step.table !== `${vq.tableSchema}.${vq.table}`) fail(id, `${w.id}: table ${step.table}`);
        }
        break;
      }
      case 'visualQuery': {
        const vq = widgets[n].dataSource?.visualQuery ?? {};
        const want = visualQueryOf(`${vq.tableSchema}.${vq.table}`, step.query);
        const have = Object.fromEntries(Object.entries(vq));
        if (!same(want, have)) fail(id, `${widgets[n].id}: visual query\n    recipe ${JSON.stringify(want)}\n    canvas ${JSON.stringify(have)}`);
        break;
      }
      case 'cubeFields': {
        const cs = widgets[n].dataSource.visualQuery.cubeSelection;
        const c = step.cube;
        const want = {
          dimensions: c.dimensions, measures: c.measures, segments: c.segments ?? [], filters: c.filters ?? [],
          granularities: c.granularities ?? {}, order: c.order ?? [], limit: c.limit ?? null, paramBindings: c.bindings ?? [],
        };
        if (!same(want, cs)) fail(id, `${widgets[n].id}: cube selection\n    recipe ${JSON.stringify(want)}\n    canvas ${JSON.stringify(cs)}`);
        break;
      }
      case 'sql':
        if (widgets[n].dataSource?.mode !== 'sql' || widgets[n].dataSource.sql !== step.sql) fail(id, `${widgets[n].id}: SQL differs`);
        break;
      case 'script':
        if (widgets[n].dataSource?.mode !== 'script' || widgets[n].dataSource.script !== step.script) fail(id, `${widgets[n].id}: script differs`);
        break;
      case 'visualizeAs':
        seen.visualized = step.widget;
        break;
      case 'displayConfig': {
        const w = widgets[n];
        if (step.widget !== w.type) fail(id, `${w.id}: display step for ${step.widget}, widget is ${w.type}`);
        if (step.widget === 'pivot') {
          if (!step.dsl || !/^pivotTable\s*\{/.test(step.dsl)) fail(id, `${w.id}: a pivot step carries its pivotTable DSL`);
        } else if (!same(step.config, w.displayConfig)) {
          fail(id, `${w.id}: display settings\n    recipe ${JSON.stringify(step.config)}\n    canvas ${JSON.stringify(w.displayConfig)}`);
        }
        if (step.widget === 'chart' && (!step.dsl || !/^chart\s*\{/.test(step.dsl))) fail(id, `${w.id}: a chart step carries its chart DSL`);
        seen.configured = true;
        break;
      }
      default:
        break;
    }
  }
  closeWidget();
  if (n + 1 !== widgets.length) fail(id, `the recipe builds ${n + 1} widgets, the canvas has ${widgets.length}`);

  const layout = recipe.steps.filter((s): s is Extract<Step, { kind: 'layout' }> => s.kind === 'layout');
  if (layout.length !== 1 || !same(layout[0].grids, widgets.map((w) => w.gridPosition)))
    fail(id, 'the layout step is not the canvas grid, widget by widget');
  if (recipe.steps[recipe.steps.length - 1].kind !== 'publish') fail(id, 'the last step is not publish');
}

async function main(): Promise<void> {
  const dir = path.join(__dirname, 'recipes');
  let checked = 0;
  for (const demo of DEMOS) {
    const file = path.join(dir, `${String(demo.nn).padStart(2, '0')}-${demo.id}.recipe.ts`);
    if (!fs.existsSync(file)) { fail(demo.id, `no recipe at ${file}`); continue; }
    const recipe: Recipe = (await import(file)).recipe;
    if (recipe.id !== demo.id || recipe.nn !== demo.nn) fail(demo.id, 'its id or number differs from the index');
    check(recipe, loadCanvas(demo.id));
    checked++;
  }
  console.log(problems.join('\n'));
  console.log(`recipes-match-canvases: ${checked} recipes checked, ${problems.length} problems`);
  process.exit(problems.length === 0 && checked === DEMOS.length ? 0 : 1);
}

void main();

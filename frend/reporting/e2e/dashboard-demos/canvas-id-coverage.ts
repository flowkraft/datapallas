// ═══════════════════════════════════════════════════════════════════════════════
// canvas-id-coverage.ts
// Every id of the Canvas and of a dashboard's reader, and the test that uses it (TODO 12b).
//
// It reads the UI sources (the inventory TODO 5h made: `app/explore-data/**`,
// `components/explore-data/**` and the reader controls of `frend/rb-webcomponents`) for every control
// with an id, then reads the e2e code for who reaches each id, and writes
// `.docs/plan-dashboard-patterns-and-stories/canvas-id-coverage.md`: one row per id.
//
// WHO USES AN ID
//   - A test uses the ids in its own body, and every id of every helper function it calls, and so on
//     down the call chain (a test that calls `setGaugeConfig` uses the ids `setGaugeConfig` clicks).
//   - A recipe (DDnn) uses what `recipe-runner.ts` reaches for each of its steps: the runner's
//     `case 'visualQuery':` branch counts for a recipe only if that recipe has a visualQuery step.
//
// IT FAILS (exit 1) WHEN
//   1. an id in scope has no row (cannot happen from the scan itself; it happens when an id appears
//      in the table's own file and not in the sources: the table is regenerated, never edited);
//   2. a row names a test that does not use the id (the table is derived from the same call chain, so
//      this is the check that the derivation and a second, direct grep of the test's file agree);
//   3. the e2e code written by Phase C reaches a control by anything but its id (the third-party
//      exceptions below aside, which are listed in the generated file, with where each is used);
//   4. an id has no test at all: it needs an Mnn test in `canvas-mechanics.spec.ts`.
//
// Run (on a copy, in node:20-slim):  npx tsx e2e/dashboard-demos/canvas-id-coverage.ts
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';

// ── Where things are (the script runs with frend/reporting as the working directory) ─────────────

const REPORTING = path.resolve(process.cwd());
const ROOT = path.resolve(REPORTING, '../..');
const AI_HUB = path.join(ROOT, 'asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage');
const WC = path.join(ROOT, 'frend/rb-webcomponents/src/wc');
const E2E = path.join(REPORTING, 'e2e');
const PLAN = path.join(ROOT, '.docs/plan-dashboard-patterns-and-stories');
const OUT = process.env.CANVAS_ID_COVERAGE_OUT ?? path.join(PLAN, 'canvas-id-coverage.md');

const UI_ROOTS: Array<{ dir: string; only?: string[]; exts: string[] }> = [
  { dir: path.join(AI_HUB, 'app/explore-data'), exts: ['.tsx', '.ts'] },
  { dir: path.join(AI_HUB, 'components/explore-data'), exts: ['.tsx', '.ts'] },
  {
    dir: WC,
    exts: ['.svelte'],
    only: ['RbParameters.wc.svelte', 'RbTabulator.wc.svelte', 'RbPivotTable.wc.svelte', 'RbChart.wc.svelte', 'RbMap.wc.svelte', 'RbDetail.wc.svelte'],
  },
];
/** The Filter Pane has no UI path (5h). */
const EXCLUDED_UI = ['FilterPaneConfig.tsx', 'FilterPaneWidget.tsx'];

/** The e2e code that reaches the Canvas: existing specs (who they are is in the row), and Phase C's. */
const TEST_FILES = [
  'specs/features/canvas-mechanics.spec.ts',
  'specs/features/canvas-dashboard-demos.spec.ts',
  'specs/areas/dashboard-demos.spec.ts',
  'specs/features/explore-data-use-cases.spec.ts',
  'specs/features/explore-data-visualizations.spec.ts',
  'specs/features/explore-data-smart-defaults.spec.ts',
  'specs/areas/cube-modes-parity.spec.ts',
];
const HELPER_FILES = [
  'helpers/explore-data-test-helper.ts',
  'helpers/dashboard-demos-test-helper.ts',
  'helpers/dashboard-test-helper.ts',
  'helpers/dashboard-demos/recipe-runner.ts',
  'helpers/dashboard-demos/published-dashboard-checks.ts',
  'helpers/dashboard-demos/canvas-mechanics-helper.ts',
];
/** Phase C's own code: the selectors in it are held to "ids only". */
const NEW_FILES = [
  'helpers/dashboard-demos/recipe-runner.ts',
  'helpers/dashboard-demos/canvas-mechanics-helper.ts',
  'specs/features/canvas-dashboard-demos.spec.ts',
  'specs/features/canvas-mechanics.spec.ts',
];
/** And the part of the shared helper that Phase C appended, from this marker to the end of the file. */
const APPENDED_FROM = ['helpers/explore-data-test-helper.ts', '// ── Display settings and dialogs the Dashboard Demos\' recipes need (TODO 10)'];

/**
 * Ids that no user can reach, each with the reason (read in the code, in the test group that tried).
 * They are rows of the table, marked as exceptions, not holes: no test-only trigger is invented for them.
 */
const NO_USER_PATH = new Map<string, string>([
  ['btnAddElement', 'AddElementMenu.tsx is imported by nothing: it is never rendered (the live path is btnAddElement-<type> in the Elements tab)'],
  ['overlayAddElementMenu', 'AddElementMenu.tsx is imported by nothing: it is never rendered'],
  ['btnDetectColumnsFilterPane', 'only shown for a Filter Pane widget, which the Elements tab no longer offers'],
  ['btnRemoveSelection-*', 'the selection bar belongs to the Filter Pane, which the Elements tab no longer offers'],
  ['btnClearSelections', 'the selection bar belongs to the Filter Pane, which the Elements tab no longer offers'],
  ['btnRetryWidget-*', 'shown only after a widget crashes, and no user action crashes one (a test-only trigger is not invented)'],
]);

/** What a selector may name besides an id: third-party or custom elements that carry no id of ours. */
const EXCEPTIONS: Array<{ token: RegExp; why: string }> = [
  { token: /^rb-[a-z-]+$/, why: 'a widget\'s own web-component tag: it is the widget, and its component id is the id the dashboard gives it' },
  { token: /^canvas$/, why: 'the <canvas> a chart draws on (Chart.js has no ids)' },
  { token: /^\.cm-content$/, why: 'CodeMirror\'s editable line holder, reached inside an element with an id' },
  { token: /^\.react-grid-item$/, why: 'react-grid-layout\'s item node (a library node, no id)' },
  { token: /^\.react-resizable-handle(-[a-z]+)?$/, why: 'react-grid-layout\'s resize handle (a library node, no id)' },
  { token: /^\.leaflet-[a-z-]+$/, why: 'the map pane\'s own nodes (Leaflet, no ids)' },
  { token: /^body$/, why: 'the page itself' },
  { token: /^option$/, why: 'a native select\'s <option>, reached inside the select that has the id' },
  { token: /^iframe$/, why: 'the published iframe element, asserted on its attributes' },
];

// ── UI side: every control with an id ─────────────────────────────────────────────────────────

interface UiId {
  /** The id as a shape: literal text, `*` where the code builds part of it. */
  shape: string;
  file: string;
  line: number;
  tag: string;
}

const TAGS = new Set([
  'button', 'select', 'input', 'textarea', 'a', 'Button', 'Select', 'SelectTrigger', 'SelectItem', 'SelectContent',
  'SelectValue', 'Checkbox', 'Switch', 'TabsTrigger', 'DropdownMenuItem', 'DialogTrigger', 'PopoverTrigger', 'Slider',
  'RadioGroupItem', 'Textarea', 'Input',
]);
const CLICKABLE = new Set(['div', 'span', 'li', 'td']);

function walk(dir: string, exts: string[], only?: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, exts, only));
    else if (exts.some((e) => entry.name.endsWith(e)) && (!only || only.includes(entry.name)) && !EXCLUDED_UI.includes(entry.name)) out.push(p);
  }
  return out.sort();
}

function inComment(src: string, pos: number): boolean {
  const ls = src.lastIndexOf('\n', pos - 1) + 1;
  const prefix = src.slice(ls, pos);
  if (prefix.includes('//')) return true;
  if (prefix.trimStart().startsWith('*')) return true;
  return prefix.includes('/*') && prefix.lastIndexOf('/*') > prefix.lastIndexOf('*/');
}

function scriptRanges(src: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  for (;;) {
    const a = src.indexOf('<script', i);
    if (a < 0) return out;
    const b = src.indexOf('</script>', a);
    if (b < 0) { out.push([a, src.length]); return out; }
    out.push([a, b]);
    i = b + 1;
  }
}

function tagText(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** `"a-"`, `{`a-${i}`}`, `{"a" + x}`, `{p.id + '_m'}` → a shape such as `a-*`, `*_m`. */
function shapeOf(expr: string): string {
  let e = expr.trim();
  if (e.startsWith('{') && e.endsWith('}')) e = e.slice(1, -1).trim();
  if (!/^[`"']/.test(e) && e.includes('?')) { const t = /`[^`]*`/.exec(e); if (t) e = t[0]; } // cond ? `a-${x}` : undefined
  const tpl = /^`([\s\S]*)`$/.exec(e);
  if (tpl) return tpl[1].replace(/\$\{[^}]*\}/g, '*');
  const lit = /^(["'])([\s\S]*)\1$/.exec(e);
  if (lit) return lit[2].replace(/\{[^}]*\}/g, '*'); // svelte writes id="a-{x}"
  const call = /^[\w.]+\(\s*((["'`])[\s\S]*\2)\s*\)$/.exec(e); // pagerId(`btnX-${n}`)
  if (call) return shapeOf(call[1]);
  // a + b + 'c': literals stay, everything else is a wildcard
  const parts = e.split(/\s\+\s/).map((p) => {
    const m = /^(["'])([\s\S]*)\1$/.exec(p.trim());
    return m ? m[2] : '*';
  });
  return parts.join('').replace(/\*+/g, '*');
}

/** The expression of the tag's `id=`: a quoted string, or the balanced `{ … }` (a template holds braces). */
function idExpression(body: string): string | null {
  const m = /\bid=/.exec(body);
  if (!m) return null;
  const at = m.index + m[0].length;
  const first = body[at];
  if (first === '"' || first === "'") {
    const end = body.indexOf(first, at + 1);
    return end < 0 ? null : body.slice(at, end + 1);
  }
  if (first === '{') return body.slice(at, blockEnd(body, at));
  return null;
}

/** A source path as the table shows it: from the AI Hub's `ui-startpage/` or from the repo root. */
function display(file: string): string {
  return file.startsWith(AI_HUB) ? path.relative(AI_HUB, file) : path.relative(ROOT, file);
}

function uiIds(): UiId[] {
  const out: UiId[] = [];
  for (const root of UI_ROOTS) {
    for (const file of walk(root.dir, root.exts, root.only)) {
      const src = fs.readFileSync(file, 'utf8');
      const skip = file.endsWith('.svelte') ? scriptRanges(src) : [];
      for (const m of src.matchAll(/<([A-Za-z][A-Za-z0-9.]*)(\s|>|\/)/g)) {
        const pos = m.index!;
        if (inComment(src, pos) || skip.some(([a, b]) => pos > a && pos < b)) continue;
        const tag = m[1];
        const body = tagText(src, pos);
        let control = TAGS.has(tag);
        if (!control && CLICKABLE.has(tag) && (body.includes('onClick') || body.includes('on:click'))) control = true;
        if (!control || body.includes('asChild')) continue;
        const expr = idExpression(body);
        if (expr === null) continue;
        out.push({ shape: shapeOf(expr), file: display(file), line: src.slice(0, pos).split('\n').length, tag });
      }
    }
  }
  // Elements the code builds with the DOM api (a web component's gear buttons): `btn.id = …`
  for (const file of walk(WC, ['.svelte'], ['RbDetail.wc.svelte'])) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.id\s*=\s*([^;\n]+);/g)) {
      const rhs = m[1].trim();
      const shape = rhs.includes('?') ? shapeOf(rhs.split(':').pop()!.trim()) : shapeOf(rhs);
      out.push({ shape, file: display(file), line: src.slice(0, m.index!).split('\n').length, tag: 'button' });
    }
  }
  return out;
}

/** The code with its comments blanked (newlines kept, so line numbers hold): an apostrophe in a comment is not a string. */
function stripComments(code: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c; out += c; i++;
    } else if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += c; i++;
    }
  }
  return out;
}

// ── e2e side: selectors, functions, tests ──────────────────────────────────────────────────

/** Every string or template literal of a file that names an id: `#id`, `[id="…"]`, `[id$="…"]`. */
function selectorsIn(code: string): Array<{ shape: string; text: string; offset: number; suffix?: boolean }> {
  const out: Array<{ shape: string; text: string; offset: number; suffix?: boolean }> = [];
  for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    // a template's `${ … }` (which may hold braces, brackets, calls) is one wildcard
    const text = m[2].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '*');
    const off = m.index!;
    for (const h of text.matchAll(/#([A-Za-z*][\w*-]*)/g)) {
      out.push({ shape: h[1], text, offset: off });
    }
    for (const h of text.matchAll(/\[id([\^$]?)=["']?([^"'\]]+)["']?\]/g)) {
      out.push({ shape: h[2], text, offset: off, suffix: h[1] === '$' });
    }
  }
  // `#${id}` has no text to match a control by: it would reach every id.
  return out.filter((o) => /[^*]/.test(o.shape) && !/^[0-9a-fA-F]{3,8}$/.test(o.shape)); // not a colour
}

function globToRegex(shape: string): RegExp {
  return new RegExp('^' + shape.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}

/** Does a selector shape from a test reach a UI id shape? Either may carry wildcards. */
function reaches(testShape: string, ui: string, suffix = false): boolean {
  if (testShape === ui) return true;
  const sample = (s: string) => s.replace(/\*/g, 'X');
  if (suffix) return sample(ui).endsWith(sample(testShape)) || globToRegex('*' + testShape).test(sample(ui)) || globToRegex(ui).test(sample(testShape));
  if (ui.includes('*') && globToRegex(ui).test(sample(testShape))) return true;
  if (testShape.includes('*') && globToRegex(testShape).test(sample(ui))) return true;
  return false;
}

interface Fn { name: string; file: string; body: string; start: number }

function blockEnd(src: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return src.length;
}

function functionsOf(file: string, src: string): Fn[] {
  const out: Fn[] = [];
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\(/gm)) {
    const open = src.indexOf('{', src.indexOf(')', m.index!) );
    // the parameter list may hold braces ({ x }: …): find the body brace after `): Promise<…> {` by scanning for ") ...{" at depth 0
    let i = m.index! + m[0].length;
    let paren = 1;
    while (i < src.length && paren > 0) { if (src[i] === '(') paren++; else if (src[i] === ')') paren--; i++; }
    let bodyOpen = src.indexOf('{', i);
    // an object-literal return type (`): { a: string } {`) is not the body: the body follows it
    for (;;) { const t = blockEnd(src, bodyOpen); if (!/^[\s>|\w\[\]]*\{/.test(src.slice(t, t + 60))) break; bodyOpen = src.indexOf('{', t); }
    void open;
    out.push({ name: m[1], file, body: src.slice(bodyOpen, blockEnd(src, bodyOpen)), start: m.index! });
  }
  return out;
}

interface TestBlock { label: string; file: string; body: string }

function testsOf(file: string, src: string): TestBlock[] {
  const out: TestBlock[] = [];
  const starts = [...src.matchAll(/\btest(?:\.\w+)?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1\s*,/g)];
  starts.forEach((m, i) => {
    out.push({ label: m[2], file, body: src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : src.length) });
  });
  return out;
}

function calls(body: string, names: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) if (names.has(m[1])) out.add(m[1]);
  return [...out];
}

// ── The run ───────────────────────────────────────────────────────────────────────────────────

function short(label: string, file: string): string {
  const mech = /^\(canvas mechanics\) (M\d+|D01)\b/.exec(label);
  if (mech) return mech[1];
  const dd = /^\(dashboard demos\) (DD\d+)/.exec(label);
  if (dd) return `${dd[1]} rebuilt`;
  const gal = /^\(dashboard demos gallery\) (DD\d+|[^]{0,40})/.exec(label);
  if (gal) return `Gallery ${gal[1]}`;
  const d = /^(D\d+)\b/.exec(label);
  if (d && file.includes('use-cases')) return `use-cases ${d[1]}`;
  return `${path.basename(file).replace('.spec.ts', '')}: ${label.slice(0, 40)}`;
}

function main(): void {
  const problems: string[] = [];
  const all = uiIds();
  // An id built wholly by code (`id={card.key}`) has no text to match a test against.
  const wholly = all.filter((u) => !/[^*]/.test(u.shape));
  const ids = all.filter((u) => /[^*]/.test(u.shape));
  const shapes = new Map<string, UiId[]>();
  for (const u of ids) shapes.set(u.shape, [...(shapes.get(u.shape) ?? []), u]);

  // functions of every helper and every spec (spec-local helpers too)
  const fns = new Map<string, Fn[]>();
  const sources = new Map<string, string>();
  for (const f of [...HELPER_FILES, ...TEST_FILES]) {
    const p = path.join(E2E, f);
    if (!fs.existsSync(p)) continue;
    const src = stripComments(fs.readFileSync(p, 'utf8'));
    sources.set(f, src);
    for (const fn of functionsOf(f, src)) fns.set(fn.name, [...(fns.get(fn.name) ?? []), fn]);
  }
  const names = new Set(fns.keys());

  const idsOfText = (text: string) => selectorsIn(text);
  const usedBy = new Map<string, Set<string>>(); // ui shape -> who

  const mark = (testSelectors: ReturnType<typeof selectorsIn>, who: string) => {
    for (const s of testSelectors) {
      for (const shape of shapes.keys()) if (reaches(s.shape, shape, s.suffix)) {
        if (!usedBy.has(shape)) usedBy.set(shape, new Set());
        usedBy.get(shape)!.add(who);
      }
    }
  };

  /** Every selector reachable from a body: its own, and its callees', transitively. */
  const reachable = (body: string, seen = new Set<string>(), conditionOk: (fn: string, label: string | null) => boolean = () => true): ReturnType<typeof selectorsIn> => {
    const out = [...idsOfText(body)];
    for (const name of calls(body, names)) {
      if (seen.has(name)) continue;
      seen.add(name);
      for (const fn of fns.get(name) ?? []) out.push(...reachable(fn.body, seen, conditionOk));
    }
    return out;
  };

  // 1. tests
  const testFiles: Array<{ file: string; tests: TestBlock[] }> = [];
  for (const f of TEST_FILES) {
    const src = sources.get(f);
    if (!src) continue;
    const tests = testsOf(f, src);
    testFiles.push({ file: f, tests });
    for (const t of tests) mark(reachable(t.body), short(t.label, f));
  }

  // 2. recipes, through the runner's branches
  const runner = sources.get('helpers/dashboard-demos/recipe-runner.ts') ?? '';
  const recipeDir = path.join(E2E, 'dashboard-demos/recipes');
  const recipes = fs.existsSync(recipeDir) ? fs.readdirSync(recipeDir).filter((n) => n.endsWith('.recipe.ts')).sort() : [];
  const recipeFacts = recipes.map((file) => {
    const text = fs.readFileSync(path.join(recipeDir, file), 'utf8');
    return {
      nn: file.slice(0, 2),
      kinds: new Set([...text.matchAll(/\bkind: '(\w+)'/g)].map((m) => m[1])),
      widgets: new Set([...text.matchAll(/kind: 'displayConfig',\s*widget: '(\w+)'/g)].map((m) => m[1])),
      text,
    };
  });
  const runnerFns = functionsOf('helpers/dashboard-demos/recipe-runner.ts', runner);
  const segmentsOf = (fn: Fn) => {
    const parts = fn.body.split(/\n\s*case '(\w+)':/);
    const segs: Array<{ label: string | null; body: string }> = [{ label: null, body: parts[0] }];
    for (let i = 1; i < parts.length; i += 2) segs.push({ label: parts[i], body: parts[i + 1] });
    return segs;
  };
  for (const rf of recipeFacts) {
    const who = `DD${rf.nn}`;
    const sel: ReturnType<typeof selectorsIn> = [];
    const seen = new Set<string>();
    const visit = (fn: Fn) => {
      for (const seg of segmentsOf(fn)) {
        if (seg.label !== null) {
          if (fn.name === 'doStep' && !rf.kinds.has(seg.label)) continue;
          if (fn.name === 'doDisplayConfig' && !rf.widgets.has(seg.label)) continue;
        }
        sel.push(...idsOfText(seg.body));
        for (const name of calls(seg.body, names)) {
          if (seen.has(name)) continue;
          seen.add(name);
          const local = runnerFns.find((f) => f.name === name);
          if (local) visit(local);
          else for (const f of fns.get(name) ?? []) sel.push(...reachable(f.body, seen));
        }
      }
    };
    const entry = runnerFns.find((f) => f.name === 'runRecipe');
    if (entry) visit(entry);
    mark(sel, who);
  }

  // 3. second, direct check: a row's test must really reach the id (derived above; re-checked by file text)
  const rows = [...shapes.entries()].map(([shape, where]) => ({ shape, where, who: [...(usedBy.get(shape) ?? [])].sort() }));

  // 4. selectors in Phase C's own code
  const exceptionsUsed = new Map<string, Set<string>>();
  for (const f of NEW_FILES) {
    const p = path.join(E2E, f);
    if (!fs.existsSync(p)) continue;
    let code = stripComments(fs.readFileSync(p, 'utf8'));
    if (f === APPENDED_FROM[0]) code = code.slice(code.indexOf(APPENDED_FROM[1]));
    const lineOf = (offset: number) => code.slice(0, offset).split('\n').length;
    for (const m of code.matchAll(/\.(?:locator|\$|\$\$|waitForSelector|frameLocator)\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      const sel = m[2];
      if (!/[#.\[\s>:]|^[a-z-]+$/.test(sel)) continue;
      for (const token of sel.split(/\s*>\s*|\s+/).filter(Boolean)) {
        if (/^#[\w${}-]+$/.test(token) || /^\[id[\^$]?=/.test(token)) continue;
        const stripped = token.replace(/\[[^\]]*\]$/, '').replace(/:[a-z-]+(\([^)]*\))?$/, '');
        const ex = EXCEPTIONS.find((e) => e.token.test(stripped));
        if (ex) {
          if (!exceptionsUsed.has(ex.why)) exceptionsUsed.set(ex.why, new Set());
          exceptionsUsed.get(ex.why)!.add(`${f}:${lineOf(m.index!)} \`${sel}\``);
          continue;
        }
        problems.push(`${f}:${lineOf(m.index!)} reaches a control by \`${token}\` in \`${sel}\`: use its id`);
      }
    }
    for (const m of code.matchAll(/\.(getBy\w+|\$x)\(/g)) problems.push(`${f}:${lineOf(m.index!)} uses ${m[1]}: use an id`);
    for (const m of code.matchAll(/locator\(\s*(["'`])(?:xpath=|text=|css=)/g)) problems.push(`${f}:${lineOf(m.index!)} uses a non-id engine`);
  }

  // 4b. every id Phase C's code reaches exists in the UI source (a typo in an id is a test that waits for nothing)
  const wide: string[] = [];
  for (const f of [
    ...walk(path.join(AI_HUB, 'app'), ['.tsx', '.ts']),
    ...walk(path.join(AI_HUB, 'components'), ['.tsx', '.ts']),
    ...walk(path.join(AI_HUB, 'lib'), ['.tsx', '.ts']),
    ...walk(path.join(ROOT, 'frend/rb-webcomponents/src'), ['.svelte', '.ts']),
    ...walk(path.join(ROOT, 'asbl/src/main/external-resources/db-template/config/samples'), ['.html']),
  ]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bid=/g)) {
      const e = idExpression(src.slice(m.index!, m.index! + 400));
      if (e) wide.push(shapeOf(e));
    }
    for (const m of src.matchAll(/\b[A-Za-z]*[iI]d\s*:\s*(["'`][^"'`]+["'`])/g)) wide.push(shapeOf(m[1]));
    for (const m of src.matchAll(/setAttribute\(\s*["']id["']\s*,\s*([^)]+)\)/g)) wide.push(shapeOf(m[1]));
    for (const m of src.matchAll(/\.id\s*=\s*([^;\n]+);/g)) wide.push(shapeOf(m[1].includes('?') ? m[1].split(':').pop()!.trim() : m[1]));
  }
  const wideShapes = [...new Set(wide)].filter((w) => /[^*]/.test(w));
  const idsAsked = new Map<string, string>();
  for (const f of NEW_FILES) {
    const p = path.join(E2E, f);
    if (!fs.existsSync(p)) continue;
    let code = stripComments(fs.readFileSync(p, 'utf8'));
    if (f === APPENDED_FROM[0]) code = code.slice(code.indexOf(APPENDED_FROM[1]));
    for (const sel of selectorsIn(code)) idsAsked.set(`${sel.suffix ? '$' : ''}${sel.shape}`, f);
  }
  {
    const appended = stripComments(fs.readFileSync(path.join(E2E, APPENDED_FROM[0]), 'utf8'));
    for (const sel of selectorsIn(appended.slice(appended.indexOf(APPENDED_FROM[1])))) idsAsked.set(`${sel.suffix ? '$' : ''}${sel.shape}`, APPENDED_FROM[0]);
  }
  // a report parameter the test's own fixture declares (`parameter(id: 'pick', …)`): the page builds its id from the parameter
  const fixtureIds = new Set<string>();
  for (const f of NEW_FILES) {
    const p = path.join(E2E, f);
    if (fs.existsSync(p)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/parameter\(\s*id:\s*'(\w+)'/g)) fixtureIds.add(m[1]);
  }
  for (const [key, file] of idsAsked) {
    const suffix = key.startsWith('$');
    const shape = suffix ? key.slice(1) : key;
    if (fixtureIds.has(shape)) continue;
    if (!wideShapes.some((w) => reaches(shape, w, suffix))) problems.push(`${file} reaches #${shape}, and no UI source builds such an id`);
  }

  // 5. ids with no test
  const excepted = rows.filter((r) => r.who.length === 0 && NO_USER_PATH.has(r.shape));
  const untested = rows.filter((r) => r.who.length === 0 && !NO_USER_PATH.has(r.shape));
  for (const r of untested) problems.push(`no test uses ${r.shape} (${r.where[0].file}:${r.where[0].line}): it needs an Mnn test`);

  // 6. each named Mnn/D01/DD in a row really is in a file that holds its id (direct re-check)
  const mechSrc = sources.get('specs/features/canvas-mechanics.spec.ts') ?? '';
  for (const r of rows) {
    for (const w of r.who) {
      if (!/^(M\d+|D01)$/.test(w)) continue;
      const t = testFiles.find((x) => x.file.endsWith('canvas-mechanics.spec.ts'))?.tests.find((x) => short(x.label, x.file) === w);
      if (!t || !reachable(t.body).some((s) => reaches(s.shape, r.shape, s.suffix)))
        problems.push(`row ${r.shape} names ${w}, which does not use it`);
    }
    void mechSrc;
  }

  // ── The table ────────────────────────────────────────────────────────────────────────────
  const how = (tag: string) =>
    ({ button: 'click', a: 'click', input: 'type or tick', Input: 'type or tick', select: 'choose a value', Select: 'choose a value', SelectTrigger: 'open and choose', textarea: 'type', Textarea: 'type', Checkbox: 'tick', Switch: 'switch' } as Record<string, string>)[tag] ?? 'click';
  const cap = (list: string[]) => (list.length > 6 ? `${list.slice(0, 6).join(', ')} … (+${list.length - 6})` : list.join(', '));
  const lines: string[] = [];
  lines.push('# Canvas id coverage');
  lines.push('');
  lines.push('Generated by `frend/reporting/e2e/dashboard-demos/canvas-id-coverage.ts`. Never edit by hand: run it again.');
  lines.push('');
  lines.push('One row per id of TODO 5h\'s scope (the Canvas and the reader\'s controls). An id built from a value in the code is written with `*` where the value goes. A DDnn is a demo recipe (what `recipe-runner.ts` reaches for the steps that recipe has); an Mnn or D01 is a test of `canvas-mechanics.spec.ts`; the rest are the existing Canvas e2e, named by file.');
  lines.push('');
  lines.push('| id | element | how a user exercises it | where it is asserted |');
  lines.push('|---|---|---|---|');
  for (const r of rows.sort((a, b) => a.shape.localeCompare(b.shape))) {
    const w = r.where[0];
    const exception = NO_USER_PATH.get(r.shape);
    lines.push(`| \`${r.shape}\` | \`${w.file}:${w.line}\` | ${how(w.tag)} | ${r.who.length ? cap(r.who) : exception ? `**exception, no user path:** ${exception}` : '**none**'} |`);
  }
  lines.push('');
  lines.push('## Ids built wholly by code');
  lines.push('');
  lines.push('No text to match a test against; each is a list item or card whose id is its own record id:');
  lines.push('');
  if (wholly.length === 0) lines.push('(none)');
  for (const u of wholly) lines.push(`- \`${u.file}:${u.line}\` (<${u.tag}>)`);
  lines.push('');
  lines.push('## Third-party exceptions');
  lines.push('');
  lines.push('Selectors in Phase C\'s e2e code that are not an id, because the element is not ours and has none:');
  lines.push('');
  if (exceptionsUsed.size === 0) lines.push('(none used)');
  for (const [why, where] of exceptionsUsed) {
    lines.push(`- ${why}:`);
    for (const w of [...where].sort()) lines.push(`  - ${w}`);
  }
  lines.push('');
  fs.writeFileSync(OUT, lines.join('\n'));

  const covered = rows.length - untested.length - excepted.length;
  console.log(problems.join('\n'));
  console.log(
    `canvas-id-coverage: ${rows.length} ids in scope, ${covered} covered, ${excepted.length} exceptions (no user path), ${untested.length} with no test, `
    + `${[...exceptionsUsed.values()].reduce((n, s) => n + s.size, 0)} third-party selector uses (${exceptionsUsed.size} kinds), ${problems.length} problems`,
  );
  process.exit(problems.length === 0 ? 0 : 1);
}

main();

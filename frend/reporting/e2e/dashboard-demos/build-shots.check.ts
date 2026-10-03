// ═══════════════════════════════════════════════════════════════════════════════
// build-shots.check.ts
// The by-program check of `build-shots.ts` (TODO 13). It never opens a browser: a stand-in page records
// what it is asked, and a recorder stands in for the screenshot, so what is proved is what the module
// decides - when it takes a picture, what it names it, what `steps.json` says - for all 25 recipes.
//
//   NEGATIVE: with the switch off nothing is asked of the page and no file or folder is written.
//   POSITIVE: with it on, every recipe step with a `shot` leaves exactly one picture, numbered in order
//             after the empty canvas, its code carried for SQL, scripts and DSL, and a rerun removes the
//             pictures of a step that is gone.
//
// Run it with the e2e helpers' own toolchain:
//
//   npx tsx e2e/dashboard-demos/build-shots.check.ts
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DEMOS, declaredParams } from '../helpers/dashboard-demos/demo-catalog';
import { answerOf, createBuildShots, plain, slug, type Shooter } from '../helpers/dashboard-demos/build-shots';
import type { Recipe } from '../helpers/dashboard-demos/recipe';

const problems: string[] = [];
const expect = (ok: boolean, what: string) => { if (!ok) problems.push(what); };

/** A page that does nothing and remembers it was asked. Enough for what build-shots calls. */
function stubPage() {
  const calls: string[] = [];
  const locator = (selector: string): any => ({
    selector,
    first: () => locator(selector),
    last: () => locator(selector),
    getAttribute: async () => { calls.push(`getAttribute ${selector}`); return 'widgetHeader-w-stub'; },
    allTextContents: async () => { calls.push(`allTextContents ${selector}`); return []; },
  });
  const page: any = {
    calls,
    locator: (selector: string) => { calls.push(`locator ${selector}`); return locator(selector); },
    setViewportSize: async () => { calls.push('setViewportSize'); },
    evaluate: async () => { calls.push('evaluate'); },
    waitForFunction: async () => { calls.push('waitForFunction'); },
    waitForTimeout: async () => { calls.push('waitForTimeout'); },
    screenshot: async () => { calls.push('screenshot'); },
  };
  return page;
}

function recorder() {
  const taken: Array<{ file: string; outDir: string; ringed: boolean; callout?: string }> = [];
  const shooter: Shooter = {
    async take(_page, file, outDir, ring, callout) { taken.push({ file, outDir, ringed: !!ring, callout }); },
  };
  return { taken, shooter };
}

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-shots-'));
  let steps = 0;
  let pictures = 0;

  for (const demo of DEMOS) {
    const recipe: Recipe = require(`./recipes/${String(demo.nn).padStart(2, '0')}-${demo.id}.recipe`).recipe;
    const folder = path.join(root, `${String(demo.nn).padStart(2, '0')}-${demo.id}`);

    // ── NEGATIVE: the switch is off ────────────────────────────────────────────
    const off = stubPage();
    const quiet = createBuildShots(off, recipe, demo, { enabled: false, imagesRoot: root });
    await quiet.start();
    for (const [i, step] of recipe.steps.entries()) await quiet.capture(step, i);
    expect(!quiet.enabled, `${demo.id}: the switch is off`);
    expect(off.calls.length === 0, `${demo.id}: with the switch off the page was asked ${off.calls.join(', ')}`);
    expect(quiet.entries.length === 0, `${demo.id}: with the switch off a picture was recorded`);
    expect(!fs.existsSync(folder), `${demo.id}: with the switch off a folder was written`);

    // ── POSITIVE: the switch is on ─────────────────────────────────────────────
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, '99-a-step-that-is-gone.png'), 'stale');
    const on = stubPage();
    const { taken, shooter } = recorder();
    const shots = createBuildShots(on, recipe, demo, { enabled: true, imagesRoot: root, shooter });
    await shots.start();
    expect(!fs.existsSync(path.join(folder, '99-a-step-that-is-gone.png')), `${demo.id}: a rerun left a stale picture`);
    expect(taken[0]?.file === '01-the-empty-canvas.png' && taken[0].ringed, `${demo.id}: the first picture is the empty canvas, with the connection ringed`);

    for (const [i, step] of recipe.steps.entries()) await shots.capture(step, i);
    const withShot = recipe.steps.filter((s) => s.shot).length;
    expect(withShot === recipe.steps.length, `${demo.id}: ${recipe.steps.length - withShot} steps have no shot`);
    expect(taken.length === 1 + withShot, `${demo.id}: ${taken.length} pictures for ${withShot} shots and the empty canvas`);
    expect(shots.entries.length === taken.length, `${demo.id}: steps.json holds ${shots.entries.length} of ${taken.length} pictures`);

    shots.entries.forEach((entry, i) => {
      expect(entry.n === i + 1, `${demo.id}: entry ${i + 1} is numbered ${entry.n}`);
      expect(entry.image.endsWith(taken[i].file) && entry.image.startsWith('/images/docs/dashboard-demos/'), `${demo.id}: entry ${entry.n}'s image is ${entry.image}`);
      expect(taken[i].file.startsWith(String(i + 1).padStart(2, '0') + '-') && taken[i].file.endsWith('.png'), `${demo.id}: ${taken[i].file} is not numbered ${i + 1}`);
      expect(entry.title.length > 0 && entry.caption.length > 0, `${demo.id}: entry ${entry.n} has no title or caption`);
      expect(!(taken[i].callout ?? '').includes('**'), `${demo.id}: entry ${entry.n}'s callout still has markdown marks`);
    });
    expect(new Set(taken.map((t) => t.file)).size === taken.length, `${demo.id}: two pictures share a file name`);

    // SQL, scripts and DSL travel with their picture, so the page can offer a copy button.
    recipe.steps.forEach((step, i) => {
      const entry = shots.entries[i + 1];
      const written = step.kind === 'sql' ? step.sql : step.kind === 'script' ? step.script
        : step.kind === 'filters' && step.via === 'dsl' ? step.dsl : step.kind === 'displayConfig' ? step.dsl : undefined;
      expect(entry.code === written, `${demo.id}: step ${i + 1} (${step.kind}) carries ${entry.code === undefined ? 'no code' : 'other code'} than it typed`);
    });

    // ── The last pictures need an answer to show ──────────────────────────────
    const answer = answerOf(demo);
    expect(!!answer, `${demo.id} has neither a story nor an interaction to end on`);
    if (answer) {
      const declared = new Set(declaredParams(demo.id).map((p) => p.id));
      for (const name of Object.keys(answer.params))
        expect(declared.has(name), `${demo.id}: its closing view sets '${name}', which no filter of it declares`);
      expect(Object.keys(answer.params).length > 0, `${demo.id}: its closing view sets no filter`);
    }
    steps += recipe.steps.length;
    pictures += taken.length;
  }

  expect(slug('Pick the orders table') === 'pick-the-orders-table', 'slug of a title');
  expect(slug('  **Hello**, World! ') === 'hello-world', 'slug drops marks and punctuation');
  expect(plain('Pick **orders**, then `Sum`') === 'Pick orders, then Sum', 'plain drops markdown marks');

  fs.rmSync(root, { recursive: true, force: true });
  if (problems.length > 0) {
    console.error(`build-shots.check: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`build-shots.check: OK - ${DEMOS.length} recipes, ${steps} steps, ${pictures} pictures (one per shot, plus each empty canvas); `
    + 'the switch off asked the page nothing and wrote nothing.');
}

main().catch((e) => { console.error(e); process.exit(1); });

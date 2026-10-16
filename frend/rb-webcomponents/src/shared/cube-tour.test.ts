//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/cube-tour.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { boldList, fieldOf, inCube, cubeShowMeSteps } from './cube-tour.ts';

const STORY = {
  id: 'category-mix',
  question: 'Which categories carry the business?',
  text: 'Tick **Net Sales** and **Share of Net Sales**, then add **Category**.',
  query: { dimensions: ['Category'], measures: ['NetSales', 'ShareOfNetSales'] },
};

/** The little of an element the tour reads: an id lookup on its root. */
function fakeRoot(ids: string[]) {
  const found = new Map(ids.map((id) => [id, { id, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) }]));
  return {
    querySelector(selector: string) {
      const m = /^\[id="(.*)"\]$/.exec(selector);
      return m ? (found.get(m[1].replace(/\\(["\\])/g, '$1')) ?? null) : null;
    },
  } as unknown as Element;
}

describe('the names a card says', () => {
  test('one, two and three names read as a sentence, each in bold', () => {
    assert.equal(boldList([]), '');
    assert.equal(boldList(['Category']), '**Category**');
    assert.equal(boldList(['A', 'B']), '**A** and **B**');
    assert.equal(boldList(['A', 'B', 'C']), '**A**, **B** and **C**');
    assert.equal(boldList(['A*B']), '**AB**');
  });

  test('a date a story reads by month is the one date in the tree', () => {
    assert.equal(fieldOf('OrderDate.month'), 'OrderDate');
    assert.equal(fieldOf('Category'), 'Category');
  });

  test('a story id is looked up as written, quotes and all', () => {
    const root = fakeRoot(['hint-a"b']);
    assert.ok(inCube(root, 'hint-a"b'));
    assert.equal(inCube(root, 'hint-other'), null);
  });
});

describe('the steps of a cube in a tour', () => {
  const root = fakeRoot(['hint-category-mix', 'btnShowMe-category-mix', 'cubeFieldsHalf', 'cubeStoriesHalf', 'cubeRuntimeResult', 'grp-measures', 'grp-main']);
  let pressed = 0;
  const steps = cubeShowMeSteps({ story: STORY, root, titleOf: (n) => ({ NetSales: 'Net Sales', ShareOfNetSales: 'Share of Net Sales', Category: 'Category' } as Record<string, string>)[n] ?? n, showMe: () => { pressed++; } });

  test('eight steps: the fields, the stories, the question, the button, the numbers, what they are read by, the answer, Reset view', () => {
    assert.equal(steps.length, 8);
    assert.equal(steps[2].title, STORY.question);
    assert.equal(steps[2].content, STORY.text);
  });

  test('each step points inside this cube, and only Reset view may be missing', () => {
    const point = (i: number) => (steps[i].target as () => Element | null)();
    const ids = (i: number) => (steps[i].target as () => Array<{ id: string }>)().map((el) => el.id);
    assert.deepEqual(ids(0), ['grp-measures', 'grp-main'], 'the two folders the words name, each lit by itself');
    assert.equal(steps[0].each, true);
    assert.equal((point(1) as unknown as { id: string }).id, 'cubeStoriesHalf');
    assert.equal((point(2) as unknown as { id: string }).id, 'hint-category-mix');
    assert.deepEqual(ids(3), ['btnShowMe-category-mix'], 'the button, and its Yes / No once that is open');
    assert.equal(steps[4].each, true, 'the ticks are lit one by one, not the whole field list');
    assert.equal(steps[5].each, true);
    assert.equal((point(6) as unknown as { id: string }).id, 'cubeRuntimeResult');
    assert.deepEqual(ids(7), [], 'Reset view and its Sure? may be missing: then there is nothing to light');
    assert.deepEqual(steps.map((s) => !!s.optional), [true, true, false, false, false, true, false, true]);
  });

  test('the first tick step says what was ticked in the reader\'s words, and is the one that presses Show Me', async () => {
    assert.equal(steps[4].title, 'Ticked for you');
    assert.match(steps[4].content, /^\*\*Net Sales\*\* and \*\*Share of Net Sales\*\*: the numbers this question adds up\./);
    await steps[5].before!();
    assert.equal(pressed, 0, 'the read-by step only scrolls: Show Me is pressed once');
    await steps[4].before!();
    assert.equal(pressed, 1);
  });
});

describe('the ticks, one step for the numbers and one for what they are read by', () => {
  /** A cube with real labels round its checkboxes, so the tour can find what to light. */
  function cubeWith(ids: string[]) {
    const label = (id: string) => ({ id, checked: true, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }), scrollIntoView() {}, closest: (tag: string) => (tag === 'label' ? { label: id, scrollIntoView() {} } : null) });
    const found = new Map(ids.map((id) => [id, label(id)]));
    return {
      querySelector(selector: string) {
        const m = /^\[id="(.*)"\]$/.exec(selector);
        return m ? (found.get(m[1]) ?? null) : null;
      },
    } as unknown as Element;
  }
  const titleOf = (n: string) => ({ NetSales: 'Net Sales', ShareOfNetSales: 'Share of Net Sales', Category: 'Category' } as Record<string, string>)[n] ?? n;
  const root = cubeWith(['chk-meas-NetSales', 'chk-meas-ShareOfNetSales', 'chk-dim-Category']);
  const steps = cubeShowMeSteps({ story: STORY, root, titleOf, showMe: () => {} });

  test('two plain steps that say different things: the numbers, then what they are read by', () => {
    assert.equal(steps[4].title, 'Ticked for you');
    assert.equal(steps[5].title, 'What they are read by');
    assert.match(steps[5].content, /^\*\*Category\*\*: what the numbers are split by, so the answer has one row for each\./);
    assert.match(steps[5].content, /Every box stays yours/);
    assert.doesNotMatch(steps[4].content, /Category/, 'the numbers step does not repeat the dimension');
    for (const s of steps) assert.equal('sequence' in s, false, 'no step is timed');
  });

  test('each of the two lights the labels of its own ticks', () => {
    const lit = (n: number) => (steps[n].target as () => Array<{ label: string }>)().map((el) => el.label);
    assert.deepEqual(lit(4), ['chk-meas-NetSales', 'chk-meas-ShareOfNetSales']);
    assert.deepEqual(lit(5), ['chk-dim-Category']);
  });

  test('a story with only numbers, only a dimension, or no ticks still presses Show Me once', async () => {
    let pressed = 0;
    const make = (query: object) => cubeShowMeSteps({ story: { ...STORY, query }, root, titleOf, showMe: () => { pressed++; } });
    const numbersOnly = make({ measures: ['NetSales'] });
    assert.equal(numbersOnly.length, 7);
    await numbersOnly[4].before!();
    const dimOnly = make({ dimensions: ['Category'] });
    assert.equal(dimOnly.length, 7);
    assert.equal(dimOnly[4].title, 'What they are read by');
    await dimOnly[4].before!();
    const none = make({});
    assert.equal(none.length, 7);
    assert.equal(none[4].title, 'Ticked for you');
    await none[4].before!();
    assert.equal(pressed, 3);
  });
});

describe('the two halves of the explorer', () => {
  const root = fakeRoot(['cubeFieldsHalf', 'cubeStoriesHalf', 'hint-category-mix']);
  const names = (n: string) => ({ NetSales: 'Net Sales', ShareOfNetSales: 'Share of Net Sales', Category: 'Category' } as Record<string, string>)[n] ?? n;
  const steps = cubeShowMeSteps({ story: STORY, root, titleOf: names, showMe: () => {} });

  test('the fields half is explained with an example of this very screen', () => {
    assert.equal(steps[0].title, 'Your data, as tick boxes');
    assert.match(steps[0].content, /The \*\*numbers\*\* are what you add up, like \*\*Net Sales\*\*;/);
    assert.match(steps[0].content, /what you \*\*group by\*\*, like \*\*Category\*\*\./);
  });

  test('the stories half is introduced as ready-made, and a story with no ticks gives no example', () => {
    assert.equal(steps[1].title, 'Data Stories: ideas to start from');
    assert.match(steps[1].content, /ideas for useful questions/);
    const bare = cubeShowMeSteps({ story: { ...STORY, query: {} }, root, titleOf: names, showMe: () => {} });
    assert.doesNotMatch(bare[0].content, /, like /);
  });
});

describe('what the first and the read-by steps light', () => {
  const label = (id: string) => ({ id, checked: true, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }), scrollIntoView() {}, closest: (tag: string) => (tag === 'label' ? { id: 'label-' + id } : null) });
  const ids = ['cubeFieldsHalf', 'grp-measures', 'grp-main', 'chk-meas-NetSales', 'chk-meas-ShareOfNetSales', 'chk-dim-Category'];
  const found = new Map(ids.map((id) => [id, label(id)]));
  const root = { querySelector: (selector: string) => found.get(/^\[id="(.*)"\]$/.exec(selector)?.[1] ?? '') ?? null } as unknown as Element;
  const steps = cubeShowMeSteps({ story: STORY, root, titleOf: (n) => n, showMe: () => {} });
  const lit = (n: number) => (steps[n].target as () => Array<{ id: string }>)().map((el) => el.id);

  test('the fields step lights the numbers folder, the first number and the group-by folder', () => {
    assert.deepEqual(lit(0), ['grp-measures', 'label-chk-meas-NetSales', 'grp-main', 'label-chk-dim-Category']);
  });

  test('the ticked-for-you step lights the numbers folder as well as the ticks', () => {
    assert.deepEqual(lit(4), ['grp-measures', 'label-chk-meas-NetSales', 'label-chk-meas-ShareOfNetSales']);
  });

  test('the read-by step lights the group-by folder as well as the ticks', () => {
    assert.deepEqual(lit(5), ['grp-main', 'label-chk-dim-Category']);
  });

  test('a cube without a folder simply lights what it has', () => {
    found.delete('grp-main');
    assert.deepEqual(lit(0), ['grp-measures', 'label-chk-meas-NetSales', 'label-chk-dim-Category']);
    found.set('grp-main', label('grp-main'));
  });
});

describe('the Show Me step shows the question the button asks', () => {
  const el = (id: string) => ({ id, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) });
  const found = new Map<string, ReturnType<typeof el>>([['btnShowMe-category-mix', el('btnShowMe-category-mix')]]);
  const root = { querySelector: (selector: string) => found.get(/^\[id="(.*)"\]$/.exec(selector)?.[1] ?? '') ?? null } as unknown as Element;
  const calls: string[] = [];
  const steps = cubeShowMeSteps({
    story: STORY, root, titleOf: (n) => n,
    showMe: () => calls.push('showMe'),
    openGate: () => { calls.push('open'); found.set('hintGate-category-mix', el('hintGate-category-mix')); },
    closeGate: () => { calls.push('close'); found.delete('hintGate-category-mix'); },
  });
  const lit = () => (steps[3].target as () => Array<{ id: string }>)().map((e) => e.id);

  test('before the step the gate is opened, and the step lights the button together with the question', async () => {
    assert.deepEqual(lit(), ['btnShowMe-category-mix']);
    await steps[3].before!();
    assert.deepEqual(lit(), ['btnShowMe-category-mix', 'hintGate-category-mix']);
    assert.match(steps[3].content, /\*\*Apply this story\?\*\*/);
    assert.match(steps[3].content, /\*\*Yes\*\*/);
  });

  test('the next step closes the question and presses Show Me, and going back closes it too', async () => {
    calls.length = 0;
    await steps[4].before!();
    assert.deepEqual(calls.slice(0, 2), ['close', 'showMe']);
    await steps[2].before!();
    assert.equal(calls.at(-1), 'close');
  });
});

describe('the Reset view step shows the question and leaves it unanswered', () => {
  const el = (id: string) => ({ id, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) });
  const found = new Map<string, ReturnType<typeof el>>([['lnkCubeResetView', el('lnkCubeResetView')], ['cubeFieldsHalf', el('cubeFieldsHalf')]]);
  const root = { querySelector: (selector: string) => found.get(/^\[id="(.*)"\]$/.exec(selector)?.[1] ?? '') ?? null } as unknown as Element;
  const calls: string[] = [];
  const steps = cubeShowMeSteps({
    story: STORY, root, titleOf: (n) => n, showMe: () => {},
    openReset: () => { calls.push('open'); found.set('resetGate', el('resetGate')); },
    closeReset: () => { calls.push('close'); found.delete('resetGate'); },
  });
  const lit = (n: number) => (steps[n].target as () => Array<{ id: string }>)().map((e) => e.id);

  test('the button is lit together with its Sure?, which the step opens', async () => {
    assert.equal(steps[7].title, 'Lost? Start over');
    await steps[7].before!();
    assert.deepEqual(lit(7), ['lnkCubeResetView', 'resetGate']);
  });

  test('the step before closes the question, and leaving the step closes it without answering', async () => {
    await steps[6].before!();
    assert.equal(calls.at(-1), 'close');
    await steps[7].before!();
    assert.equal(calls.at(-1), 'open');
    const undo = steps[7].during!() as () => void;
    undo();
    assert.equal(calls.at(-1), 'close');
    assert.ok(!calls.includes('yes'));
  });
});

describe('the fields step lets the whole list show, and puts everything back', () => {
  test('the list is let out of its scrolling box and lifted while the step is shown, then restored exactly', () => {
    const half = { id: 'cubeFieldsHalf', scrollTop: 40, style: { maxHeight: '300px', overflow: 'auto', zIndex: '' } };
    const root = { querySelector: (selector: string) => (/cubeFieldsHalf/.test(selector) ? half : null) } as unknown as Element;
    const steps = cubeShowMeSteps({ story: STORY, root, titleOf: (n) => n, showMe: () => {} });
    const undo = steps[0].during!() as () => void;
    assert.deepEqual([half.style.maxHeight, half.style.overflow, half.style.zIndex], ['none', 'visible', '99999']);
    undo();
    assert.deepEqual([half.style.maxHeight, half.style.overflow, half.style.zIndex, half.scrollTop], ['300px', 'auto', '', 40]);
  });

  test('a cube without a fields list changes nothing', () => {
    const root = { querySelector: () => null } as unknown as Element;
    const steps = cubeShowMeSteps({ story: STORY, root, titleOf: (n) => n, showMe: () => {} });
    assert.equal(steps[0].during!(), undefined);
  });
});


describe('the fields step ticks its example for real', () => {
  /** Boxes that tick when clicked, as the cube's own do: the tour must press them, not set them. */
  function boxes(start: Record<string, boolean>) {
    const clicks: string[] = [];
    const found = new Map<string, { id: string; checked: boolean; scrollTop: number; click: () => void }>(
      Object.entries(start).map(([id, checked]) => [id, { id, checked, scrollTop: 0, click() { this.checked = !this.checked; clicks.push(id); } }]),
    );
    const root = {
      querySelector(selector: string) {
        const m = /^\[id="(.*)"\]$/.exec(selector);
        return m ? (found.get(m[1]) ?? null) : null;
      },
      querySelectorAll: () => [...found.values()].filter((b) => b.id.startsWith('chk-dim-')),
    } as unknown as Element;
    return { root, clicks, found };
  }
  const titleOf = (n: string) => (n === "NetSales" ? "Net Sales" : n);

  test('the example dimension is ticked and the others are unticked, by clicks, and the answer is waited for', async () => {
    const { root, clicks, found } = boxes({ 'chk-meas-NetSales': true, 'chk-dim-Channel': true, 'chk-dim-Category': false, 'chk-dim-Brand': false });
    let waited = 0;
    const steps = cubeShowMeSteps({ story: STORY, root, titleOf, showMe: () => {}, answered: () => { waited++; } });
    await steps[0].before!();
    assert.deepEqual(clicks, ['chk-dim-Channel', 'chk-dim-Category'], 'Channel off, then Category on; Net Sales was ticked already');
    assert.equal(found.get('chk-dim-Category')!.checked, true);
    assert.equal(waited, 1);
    assert.match(steps[0].content, /the tour has just ticked \*\*Net Sales\*\* and \*\*Category\*\*, so the answer below is \*\*Net Sales\*\* by \*\*Category\*\*/);
  });

  test('a number that was not ticked is ticked too, and nothing already right is clicked again', async () => {
    const { root, clicks } = boxes({ 'chk-meas-NetSales': false, 'chk-dim-Category': true });
    const steps = cubeShowMeSteps({ story: STORY, root, titleOf, showMe: () => {} });
    await steps[0].before!();
    assert.deepEqual(clicks, ['chk-meas-NetSales']);
  });
});

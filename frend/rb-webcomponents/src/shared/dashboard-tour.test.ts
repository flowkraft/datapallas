//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/dashboard-tour.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dashboardTourSteps } from './dashboard-tour.ts';
import type { TourStep } from './tour.ts';

/** An element as the tour reads it: its tile, whether the explorer holds it, and its text. */
interface Fake {
  tag: string;
  text?: string;
  tile?: Fake;
  inCube?: boolean;
  halves?: Fake;
  closest(selector: string): Fake | null;
  querySelector(selector: string): Fake | null;
}

function el(tag: string, o: { text?: string; inCube?: boolean; halves?: boolean } = {}): Fake {
  const self: Fake = {
    tag,
    text: o.text,
    inCube: o.inCube,
    halves: o.halves ? ({ tag: 'cube-root' } as Fake) : undefined,
    querySelector: (selector: string) => (selector === '.rb-cube-root' ? (self.halves ?? null) : null),
    closest(selector: string) {
      if (selector === 'rb-cube-renderer') return self.inCube ? self : null;
      return self.tile ?? null;
    },
  };
  // Every widget sits in a tile of its own.
  self.tile = { tag: 'tile-of-' + tag, closest: () => null } as Fake;
  return self;
}

/** A dashboard as a list of elements; `querySelector` finds the first of a tag, `querySelectorAll` all of them. */
function dashboard(parts: Fake[], filterLabel?: string) {
  return {
    querySelectorAll: (tag: string) => parts.filter((p) => p.tag === tag),
    querySelector: (selector: string) => {
      if (selector === 'rb-parameters label') return filterLabel === undefined ? null : { textContent: filterLabel };
      return parts.find((p) => p.tag === selector) ?? null;
    },
  } as unknown as ParentNode;
}

const CUBE_STEPS: TourStep[] = [{ title: 'Which categories carry the business?', content: 'x' }, { title: 'Show Me', content: 'y' }];

const full = () =>
  dashboard(
    [el('rb-parameters'), el('rb-value'), el('rb-value'), el('rb-chart'), el('rb-tabulator'), el('rb-cube-renderer', { halves: true }), el('rb-tabulator', { inCube: true })],
    ' Country ',
  );

describe('the tour of a dashboard', () => {
  test('it goes from the filter through the numbers, the chart and the table to the explorer, and ends on the picture', () => {
    const steps = dashboardTourSteps({ root: full(), cubeSteps: CUBE_STEPS });
    assert.deepEqual(
      steps.map((s) => s.title),
      [
        'A short tour of this page',
        'One filter moves the whole page',
        'The headline numbers',
        'The shape of it',
        'The exact figures',
        'Your own questions',
        'Which categories carry the business?',
        'Show Me',
        'Your turn',
      ],
    );
    assert.equal(steps[0].target, undefined);
    assert.equal(steps[steps.length - 1].art, 'celebrate');
  });

  test('the filter is explained by its own name', () => {
    const steps = dashboardTourSteps({ root: full(), cubeSteps: CUBE_STEPS });
    assert.match(steps[1].content, /^The \*\*Country\*\* filter decides what everything below is about\. Here you could choose a country and press \*\*Apply\*\*: everything would be calculated again for it/);
    assert.match(steps[1].content, /and the explorer at the bottom\./);
  });

  test('each step lights the tile of its widget, the numbers together, and never a table of the explorer', () => {
    const steps = dashboardTourSteps({ root: full(), cubeSteps: CUBE_STEPS });
    const at = (i: number) => (steps[i].target as () => unknown)();
    assert.equal((at(1) as Fake).tag, 'tile-of-rb-parameters');
    assert.equal((at(2) as Fake[]).length, 2, 'both numbers are lit, each in its own tile');
    assert.equal((at(3) as Fake).tag, 'tile-of-rb-chart');
    assert.equal((at(4) as Fake).tag, 'tile-of-rb-tabulator');
    // The explorer is lit as the whole outer box, from its "Interactive Data Explorer" label down.
    assert.equal((at(5) as Fake).tag, 'cube-root');
  });

  test('a part the dashboard does not have is left out, and with no explorer the end says so', () => {
    const steps = dashboardTourSteps({ root: dashboard([el('rb-value'), el('rb-chart')]), cubeSteps: [] });
    assert.deepEqual(steps.map((s) => s.title), ['A short tour of this page', 'The headline numbers', 'The shape of it', 'Your turn']);
    assert.doesNotMatch(steps[steps.length - 1].content, /Show Me/);
  });

  test('an explorer with no stories is still introduced, without a story to follow', () => {
    const steps = dashboardTourSteps({ root: dashboard([el('rb-cube-renderer')]), cubeSteps: [] });
    const intro = steps.find((s) => s.title === 'Your own questions')!;
    assert.doesNotMatch(intro.content, /follows the first one/);
    assert.equal(steps.length, 3);
  });

  test('a filter without a readable label is still a filter', () => {
    const steps = dashboardTourSteps({ root: dashboard([el('rb-parameters')]), cubeSteps: [] });
    assert.match(steps[1].content, /^The filter decides what everything below is about\. Here you could choose a value and press/);
  });
});

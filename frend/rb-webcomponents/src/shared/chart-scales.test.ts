// A pie is not drawn on axes: the scales a chart is given to colour are the ones its type draws.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/chart-scales.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { scalesToTheme } from './chart-scales.ts';

describe('the scales a chart is given to colour', () => {
  test('a pie and a doughnut get none, so no axes are drawn behind them', () => {
    assert.deepEqual(scalesToTheme('pie', undefined), {});
    assert.deepEqual(scalesToTheme('doughnut', undefined), {});
  });

  test('a polar area and a radar get their one radial scale', () => {
    assert.deepEqual(scalesToTheme('polarArea', undefined), { r: {} });
    assert.deepEqual(scalesToTheme('radar', undefined), { r: {} });
  });

  test('every other chart gets x and y, as before', () => {
    assert.deepEqual(scalesToTheme('bar', undefined), { x: {}, y: {} });
    assert.deepEqual(scalesToTheme('line', undefined), { x: {}, y: {} });
  });

  test('scales the author named are kept, as a copy', () => {
    const named = { y: { min: 0 } };
    const out = scalesToTheme('pie', named);
    assert.deepEqual(out, named);
    assert.notEqual(out, named);
  });
});

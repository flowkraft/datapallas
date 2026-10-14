// A legend tells series apart: one series has none to tell apart.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/chart-legend.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { legendShown, readableLegend, splitSeriesName, withLegendRule } from './chart-legend.ts';

describe('whether a chart shows its legend', () => {
  test('one series has no legend, two have one', () => {
    assert.equal(legendShown('line', 1, undefined), false);
    assert.equal(legendShown('bar', 0, undefined), false);
    assert.equal(legendShown('bar', 2, undefined), true);
  });

  test('a pie, a doughnut and a polar area name their slices, so they keep it', () => {
    assert.equal(legendShown('pie', 1, undefined), true);
    assert.equal(legendShown('doughnut', 1, undefined), true);
    assert.equal(legendShown('polarArea', 1, undefined), true);
  });

  test('a legend the author switched on or off stays so', () => {
    assert.equal(legendShown('line', 1, true), true);
    assert.equal(legendShown('bar', 3, false), false);
  });
});

describe('the legend options a chart is drawn with', () => {
  test('one series: hidden, and marked as hidden by the rule', () => {
    assert.deepEqual(withLegendRule('line', 1, undefined), { display: false, rbAutoHidden: true });
    assert.deepEqual(withLegendRule('bar', 1, { position: 'bottom' }), { position: 'bottom', display: false, rbAutoHidden: true });
  });

  test('redrawn with a second series, the legend the rule hid comes back', () => {
    const hidden = withLegendRule('line', 1, { position: 'bottom' });
    assert.deepEqual(withLegendRule('line', 2, hidden), { position: 'bottom' });
    // and a redraw that is still one series leaves it hidden
    assert.equal(withLegendRule('line', 1, hidden), hidden);
  });

  test('a legend the author switched off stays off, whatever the series', () => {
    const off = { display: false };
    assert.equal(withLegendRule('line', 3, off), off);
  });

  test('several series, or a pie, keep the legend untouched', () => {
    assert.equal(withLegendRule('bar', 2, undefined), undefined);
    const own = { position: 'right' };
    assert.equal(withLegendRule('pie', 1, own), own);
  });
});

describe('the name of a series split by a column', () => {
  test('is the value, not the field in front of it', () => {
    assert.equal(splitSeriesName('marketplace'), 'marketplace');
    assert.equal(splitSeriesName('Customer Support'), 'Customer Support');
  });

  test('an empty value still has a name', () => {
    assert.equal(splitSeriesName(''), '(none)');
  });
});

describe('a legend beside stored values', () => {
  test('its items read as the axis writes them, keeping what a click toggles', () => {
    const generate = () => [{ text: 'web', index: 0 }, { text: 'sales_rep', index: 1, hidden: true }];
    const items = readableLegend(generate)({});
    assert.deepEqual(items, [{ text: 'Web', index: 0 }, { text: 'Sales rep', index: 1, hidden: true }]);
  });

  test('a legend of names written for a reader is left as it is', () => {
    const own = [{ text: 'Revenue' }, { text: 'Target' }];
    assert.deepEqual(readableLegend(() => own)({}), own);
  });
});

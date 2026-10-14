//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/box-plot.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { boxPlotFromDrawn, boxPlotFromRows, boxTooltipLines } from './box-plot.ts';

const rows = [
  { carrier: 'UPS', delivery_days: 2 },
  { carrier: 'DHL', delivery_days: 5 },
  { carrier: 'UPS', delivery_days: 4 },
  { carrier: 'UPS', delivery_days: null },
  { carrier: 'DHL', delivery_days: '7' },
];

describe('box plot data', () => {
  test('rows: one box per category, every value of it, an empty cell left out', () => {
    assert.deepEqual(boxPlotFromRows(rows, 'carrier', 'delivery_days'), {
      labels: ['UPS', 'DHL'],
      datasets: [{ label: 'delivery_days', data: [[2, 4], [5, 7]] }],
    });
  });

  test('drawn data with one point per row gives the same boxes as the rows', () => {
    // What a published chart and the Canvas both hand <rb-chart>: a label and a value per row.
    const drawn = {
      labels: rows.map((r) => r.carrier),
      datasets: [{ label: 'delivery_days', data: rows.map((r) => r.delivery_days) }],
    };
    assert.deepEqual(boxPlotFromDrawn(drawn), boxPlotFromRows(rows, 'carrier', 'delivery_days'));
  });

  test('drawn points that are lists already give all their values', () => {
    const drawn = { labels: ['a', 'b'], datasets: [{ label: 'n', data: [[1, 2, 3], [4]] }] };
    assert.deepEqual(boxPlotFromDrawn(drawn).datasets[0].data, [[1, 2, 3], [4]]);
  });

  test('nothing drawn is no box, not an error', () => {
    assert.deepEqual(boxPlotFromDrawn({ labels: [], datasets: [] }), { labels: [], datasets: [] });
    assert.deepEqual(boxPlotFromDrawn(undefined), { labels: [], datasets: [] });
    assert.deepEqual(boxPlotFromRows([], 'x', 'y').labels, []);
  });
});

describe('a box\'s tooltip', () => {
  const stats = { min: 1, q1: 3, median: 5, mean: 5.2345, q3: 7, max: 12, outliers: [19] };

  test('a line a figure, from the top, under the series headed for a reader', () => {
    assert.deepEqual(boxTooltipLines('delivery_days', stats),
      ['Delivery days', 'Max: 12', '75%: 7', 'Median: 5', 'Mean: 5.23', '25%: 3', 'Min: 1']);
  });

  test('a hovered outlier says its value', () => {
    assert.deepEqual(boxTooltipLines('delivery_days', stats, 0), ['Delivery days: outlier 19']);
  });

  test('no figures: just the series', () => {
    assert.deepEqual(boxTooltipLines('Salary', null), ['Salary']);
  });
});

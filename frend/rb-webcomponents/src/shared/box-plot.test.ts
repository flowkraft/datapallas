//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/box-plot.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { boxPlotFromDrawn, boxPlotFromRows } from './box-plot.ts';

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

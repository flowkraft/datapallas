// What a chart's axes say that its query cannot: dates as their buckets, shares up to 100.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/chart-axes.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyDateLabels, applyShareStackMax, dateLabelWriter, stacksAreShares } from './chart-axes.ts';

describe('date buckets on a category axis', () => {
  test('months are written as the month', () => {
    const write = dateLabelWriter(['2024-01-01', '2024-02-01', '2024-03-01T00:00:00'])!;
    assert.equal(write('2024-01-01'), '2024-01');
    assert.equal(write('2024-03-01T00:00:00'), '2024-03');
  });

  test('a month missing here and there is still months', () => {
    const write = dateLabelWriter(['2024-01-01', '2024-04-01', '2024-05-01'])!;
    assert.equal(write('2024-04-01'), '2024-04');
  });

  test('quarters are written as the quarter', () => {
    const write = dateLabelWriter(['2024-01-01', '2024-04-01', '2024-07-01', '2024-10-01', '2025-01-01'])!;
    assert.equal(write('2024-07-01'), '2024 Q3');
    assert.equal(write('2025-01-01 00:00:00.0'), '2025 Q1');
  });

  test('days and weeks keep their date, without the midnight', () => {
    const write = dateLabelWriter(['2024-01-01T00:00:00Z', '2024-01-08T00:00:00Z'])!;
    assert.equal(write('2024-01-08T00:00:00Z'), '2024-01-08');
  });

  test('labels that are not all dates are written as they are', () => {
    assert.equal(dateLabelWriter(['2024-01', '2024-02']), null);
    assert.equal(dateLabelWriter(['2024-01-01', 'Other']), null);
    assert.equal(dateLabelWriter(['2024-01-01T10:30:00']), null);
    assert.equal(dateLabelWriter([]), null);
  });
});

describe('a built chart writes its date labels as buckets', () => {
  const monthly = () => ({ type: 'line', data: { labels: ['2024-01-01', '2024-02-01'], datasets: [] }, options: {} as any });

  test('the category axis and the tooltip title, the labels kept as they are', () => {
    const config = monthly();
    applyDateLabels(config);
    assert.deepEqual(config.data.labels, ['2024-01-01', '2024-02-01']);
    const callback = config.options.scales.x.ticks.callback;
    assert.equal(callback.call({ getLabelForValue: (v: number) => config.data.labels[v] }, 1, 1), '2024-02');
    assert.equal(config.options.plugins.tooltip.callbacks.title([{ label: '2024-01-01' }]), '2024-01');
    // written on one line, the ones that do not fit skipped
    assert.equal(config.options.scales.x.ticks.maxRotation, 0);
    assert.equal(config.options.scales.x.ticks.autoSkip, true);
    // the other axis is still there to be coloured
    assert.ok(config.options.scales.y);
  });

  test('a horizontal chart writes them on its y axis', () => {
    const config = monthly();
    config.options.indexAxis = 'y';
    applyDateLabels(config);
    assert.equal(typeof config.options.scales.y.ticks.callback, 'function');
  });

  test('a callback the configuration has is left to it; a pie is left alone', () => {
    const own = () => 'own';
    const config = monthly();
    config.options.scales = { x: { ticks: { callback: own } } };
    applyDateLabels(config);
    assert.equal(config.options.scales.x.ticks.callback, own);
    const pie: any = { type: 'pie', data: { labels: ['2024-01-01'] }, options: {} };
    applyDateLabels(pie);
    assert.equal(pie.options.scales, undefined);
  });
});

describe('a stacked chart of shares ends at 100', () => {
  const shares = () => ({
    type: 'line',
    data: { datasets: [{ data: [60.01, 55] }, { data: [39.99, 45.02] }] },
    options: { scales: { x: {}, y: { stacked: true } } } as any,
  });

  test('every stack totals 100, to the rounding of its values', () => {
    assert.equal(stacksAreShares(shares().data.datasets), true);
    assert.equal(stacksAreShares([{ data: [60] }, { data: [50] }]), false);
    assert.equal(stacksAreShares([{ data: [100] }]), false);
  });

  test('the value axis runs 0 to 100', () => {
    const config = shares();
    applyShareStackMax(config);
    assert.equal(config.options.scales.y.max, 100);
    assert.equal(config.options.scales.y.min, 0);
  });

  test('not stacked, a range named, or 100% stacked already: left as it is', () => {
    const flat = shares();
    flat.options.scales.y.stacked = false;
    applyShareStackMax(flat);
    assert.equal(flat.options.scales.y.max, undefined);

    const named = shares();
    named.options.scales.y.max = 120;
    applyShareStackMax(named);
    assert.equal(named.options.scales.y.max, 120);

    const mode = shares();
    mode.options.rbStack100 = true;
    applyShareStackMax(mode);
    assert.equal(mode.options.scales.y.max, undefined);
  });
});

// What a chart's axes say that its query cannot: dates as their buckets, shares up to 100.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/chart-axes.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyBubbleRoom, applyDateLabels, applyShareStackMax, dateLabelWriter, readableValue, shortenLabel, stacksAreShares } from './chart-axes.ts';

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
    assert.equal(config.options.scales.x.ticks.autoSkipPadding, 12, 'the dates kept do not run together');
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

describe('values kept the database\'s way, written for a reader', () => {
  test('words joined by _ read as words', () => {
    assert.equal(readableValue('paid_social'), 'Paid social');
    assert.equal(readableValue('sales_rep'), 'Sales rep');
    assert.equal(readableValue('no_longer_needed'), 'No longer needed');
  });

  test('anything else is left as it is', () => {
    assert.equal(readableValue('web'), 'web');
    assert.equal(readableValue('Smart Home'), 'Smart Home');
    assert.equal(readableValue('order_ID'), 'order_ID');
    assert.equal(readableValue(null), '');
  });

  test('on the axis and in the tooltip; the labels a click filters by stay', () => {
    const config: any = { type: 'bar', data: { labels: ['paid_social', 'web'], datasets: [] }, options: {} };
    applyDateLabels(config);
    assert.deepEqual(config.data.labels, ['paid_social', 'web']);
    const callback = config.options.scales.x.ticks.callback;
    assert.equal(callback.call({ getLabelForValue: (v: number) => config.data.labels[v] }, 0, 0), 'Paid social');
    // beside a stored value, one lower-case word gets its capital too: "Web" beside "Paid social"
    assert.equal(config.options.plugins.tooltip.callbacks.title([{ label: 'web' }]), 'Web');
    // not dates: the axis keeps Chart.js's own rotation
    assert.equal(config.options.scales.x.ticks.maxRotation, undefined);
  });

  test('a chart with no such value is left alone', () => {
    const config: any = { type: 'bar', data: { labels: ['web', 'Smart Home'], datasets: [] }, options: {} };
    applyDateLabels(config);
    assert.equal(config.options.scales, undefined);
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

describe('a bubble chart', () => {
  test('leaves room for its bubbles at both ends of both axes', () => {
    const config: any = { type: 'bubble', data: { datasets: [] }, options: { scales: { y: { ticks: { color: '#ddd' } } } } };
    applyBubbleRoom(config);
    assert.equal(config.options.scales.x.grace, '12%');
    assert.equal(config.options.scales.y.grace, '12%');
    assert.equal(config.options.scales.y.ticks.color, '#ddd');
  });

  test('a range or a grace the configuration names is left to it; other charts are left alone', () => {
    const config: any = { type: 'bubble', options: { scales: { x: { min: 0 }, y: { grace: 5 } } } };
    applyBubbleRoom(config);
    assert.equal(config.options.scales.x.grace, undefined);
    assert.equal(config.options.scales.y.grace, 5);
    const bar: any = { type: 'bar', options: {} };
    applyBubbleRoom(bar);
    assert.equal(bar.options.scales, undefined);
  });
});

describe('the names of a chart\'s series and slices, beside stored values', () => {
  test('a pie\'s tooltip names its slice as the axis would', () => {
    const pie: any = { type: 'pie', data: { labels: ['web', 'sales_rep', 'Smart Home'], datasets: [{ data: [1, 2, 3] }] }, options: {} };
    applyDateLabels(pie);
    assert.equal(pie.options.scales, undefined);
    const label = pie.options.plugins.tooltip.callbacks.label;
    assert.equal(label({ label: 'sales_rep', formattedValue: '2' }), 'Sales rep: 2');
    assert.equal(label({ label: 'web', formattedValue: '1' }), 'Web: 1');
    assert.equal(label({ label: 'Smart Home', formattedValue: '3' }), 'Smart Home: 3');
  });

  test('a chart split by a column names each series so; a label callback of its own stays', () => {
    const split: any = { type: 'line', data: { labels: ['a'], datasets: [{ label: 'paid_search', data: [1] }, { label: 'organic', data: [2] }] }, options: {} };
    applyDateLabels(split);
    assert.equal(split.options.plugins.tooltip.callbacks.label({ dataset: { label: 'organic' }, formattedValue: '2' }), 'Organic: 2');
    const own = () => 'own';
    const mine: any = { ...split, options: { plugins: { tooltip: { callbacks: { label: own } } } } };
    applyDateLabels(mine);
    assert.equal(mine.options.plugins.tooltip.callbacks.label, own);
  });

  test('series named for a reader already are left alone', () => {
    const plain: any = { type: 'bar', data: { labels: ['a'], datasets: [{ label: 'Revenue', data: [1] }, { label: 'Target', data: [2] }] }, options: {} };
    applyDateLabels(plain);
    assert.equal(plain.options.plugins, undefined);
  });
});

describe('the names down a row chart', () => {
  const rows = () => ({
    type: 'bar',
    data: { labels: ['OFF-0127 Pikaro Conference One 532', 'MON-0102 Velmont 27 Go 953'], datasets: [{ data: [7000, 6800] }] },
    options: { indexAxis: 'y' },
  });
  const tick = (config: any, width: number, index: number) => config.options.scales.y.ticks.callback.call(
    { chart: { width }, getLabelForValue: (v: number) => config.data.labels[v] }, index, index, []);

  test('a name is cut at its end only when it is wider than 40% of the chart', () => {
    assert.equal(shortenLabel('OFF-0127 Pikaro Conference One 532', 18), 'OFF-0127 Pikaro C…');
    assert.equal(shortenLabel('Short', 18), 'Short');
    const config: any = rows();
    applyDateLabels(config);
    assert.equal(tick(config, 340, 0), 'OFF-0127 Pikaro Co…', 'a phone: 136 px of names');
    assert.equal(tick(config, 340, 1), 'MON-0102 Velmont 2…');
    assert.equal(tick(config, 1300, 0), 'OFF-0127 Pikaro Conference One 532', 'a desktop: whole');
  });

  test('a callback of the author\'s writes first; drawing again does not cut twice; columns are not touched', () => {
    const config: any = rows();
    config.options.scales = { y: { ticks: { callback: (_v: unknown, i: number) => `#${i} ${config.data.labels[i]}` } } };
    applyDateLabels(config);
    const once = config.options.scales.y.ticks.callback;
    applyDateLabels(config);
    assert.equal(config.options.scales.y.ticks.callback, once);
    assert.equal(tick(config, 340, 0), '#0 OFF-0127 Pikaro…');
    const columns: any = { type: 'bar', data: { labels: ['A long name of a product'], datasets: [{ data: [1] }] }, options: {} };
    applyDateLabels(columns);
    assert.equal(columns.options.scales?.y?.ticks?.callback, undefined);
  });
});

describe('a scatter point in its tooltip', () => {
  const scatter = (label?: string) => ({
    type: 'scatter',
    data: { datasets: [{ label, data: [{ x: 2.8, y: 330 }] }] },
    options: {} as any,
  });
  const item = (config: any) => ({
    parsed: { x: 2.8, y: 330 }, formattedValue: '(2.8, 330)', dataset: config.data.datasets[0],
    chart: { scales: { y: { getLabelForValue: (v: number) => v.toLocaleString('en-US') } } },
  });

  test('its series and its value up the chart, not the pair', () => {
    const config = scatter('Units sold');
    applyDateLabels(config);
    assert.equal(config.options.plugins.tooltip.callbacks.label(item(config)), 'Units sold: 330');
  });

  test('a series kept the database\'s way reads as words; no name, the value alone', () => {
    const named = scatter('units_sold');
    applyDateLabels(named);
    assert.equal(named.options.plugins.tooltip.callbacks.label(item(named)), 'Units sold: 330');
    const bare = scatter();
    applyDateLabels(bare);
    assert.equal(bare.options.plugins.tooltip.callbacks.label(item(bare)), '330');
  });

  test('a label of the author\'s is kept', () => {
    const config = scatter('Units sold');
    const own = () => 'own';
    config.options = { plugins: { tooltip: { callbacks: { label: own } } } };
    applyDateLabels(config);
    assert.equal(config.options.plugins.tooltip.callbacks.label, own);
  });
});

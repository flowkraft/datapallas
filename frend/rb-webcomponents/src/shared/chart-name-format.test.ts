// A chart with no number format of its own writes money and shares the way their names say.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/chart-name-format.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyNamedFormat, namedKindOf, namedWriter } from './chart-name-format.ts';

describe('what a measure name says', () => {
  test('money, word by word', () => {
    assert.equal(namedKindOf('total_amount_sum'), 'currency');
    assert.equal(namedKindOf('revenue'), 'currency');
    assert.equal(namedKindOf('total_cost'), 'currency');
    assert.equal(namedKindOf('grossProfit'), 'currency');
  });

  test('a share, before the money it is a share of', () => {
    assert.equal(namedKindOf('late_pct'), 'share');
    assert.equal(namedKindOf('win_rate_pct'), 'share');
    assert.equal(namedKindOf('discount_rate'), 'share');
    assert.equal(namedKindOf('pct_of_orders'), 'share');
  });

  test('a count is a count, whatever else it names', () => {
    assert.equal(namedKindOf('payment_count'), '');
    assert.equal(namedKindOf('closed_deals'), '');
    assert.equal(namedKindOf('order_id_count'), '');
  });

  test('anything else says nothing', () => {
    assert.equal(namedKindOf('headcount'), '');
    assert.equal(namedKindOf('total'), '');
    assert.equal(namedKindOf('csat'), '');
  });
});

describe('how the names write a chart', () => {
  test('money: whole on the axis, cents in the tooltip', () => {
    const write = namedWriter(['revenue'], [800997.01])!;
    assert.equal(write.axis(300000), '$300,000');
    assert.equal(write.tooltip(800997.01), '$800,997.01');
  });

  test('shares in points stay points, fractions become points', () => {
    assert.equal(namedWriter(['late_pct'], [12.38, 40])!.tooltip(12.38), '12.38%');
    assert.equal(namedWriter(['share'], [0.34, 0.66])!.tooltip(0.34), '34%');
  });

  test('series that do not agree are left alone', () => {
    assert.equal(namedWriter(['revenue', 'late_pct'], [1, 2]), null);
    assert.equal(namedWriter(['orders'], [1]), null);
    assert.equal(namedWriter([], []), null);
  });
});

describe('a built chart', () => {
  const bars = (options: any = {}) => ({
    type: 'bar',
    data: { labels: ['a', 'b'], datasets: [{ label: 'Amount', data: [800997.01, 5] }] },
    options,
  });

  test('the value axis and the tooltip', () => {
    const config: any = bars();
    applyNamedFormat(config, ['total_amount_sum']);
    assert.equal(config.options.scales.y.ticks.callback(300000), '$300,000');
    assert.equal(config.options.plugins.tooltip.callbacks.label({ dataset: { label: 'Amount' }, parsed: { x: 0, y: 800997.01 } }),
      'Amount: $800,997.01');
  });

  test('a format the chart names wins, and so does its own callback', () => {
    const named: any = bars({ rbNumberFormat: 'compact' });
    applyNamedFormat(named, ['revenue']);
    assert.equal(named.options.scales, undefined);
    const own = () => 'own';
    const mine: any = bars({ plugins: { tooltip: { callbacks: { label: own } } } });
    applyNamedFormat(mine, ['revenue']);
    assert.equal(mine.options.plugins.tooltip.callbacks.label, own);
  });

  test('a pie names its slice; a scatter is left alone', () => {
    const pie: any = { type: 'pie', data: { labels: ['web'], datasets: [{ data: [53.24] }] }, options: {} };
    applyNamedFormat(pie, ['pct_of_orders']);
    assert.equal(pie.options.scales, undefined);
    assert.equal(pie.options.plugins.tooltip.callbacks.label({ label: 'web', raw: 53.24 }), 'web: 53.24%');
    const scatter: any = { type: 'scatter', data: { datasets: [{ data: [{ x: 2.8, y: 330 }] }] }, options: {} };
    applyNamedFormat(scatter, ['revenue']);
    assert.deepEqual(scatter.options, {});
  });
});

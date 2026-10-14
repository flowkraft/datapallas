//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/table-extras.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyTableExtras, COLUMN_FLOOR_PX, highlightStyle, highlightsOf, rangesOf, sumIfNumbers, withColumnFloor, withTotal } from './table-extras.ts';

describe('a table beyond Tabulator', () => {
  test('a total is the sum of numbers; a text column has none', () => {
    assert.equal(sumIfNumbers([1, 2.5, null, '3']), 6.5);
    assert.equal(sumIfNumbers(['web', 'store']), '');
    assert.equal(sumIfNumbers([]), '');
  });

  test('the total is written the way the column writes its values; a percent has none', () => {
    const money = withTotal({ field: 'total', formatter: 'money', formatterParams: { symbol: '$' } });
    assert.equal(money.bottomCalcFormatter, 'money');
    assert.deepEqual(money.bottomCalcFormatterParams, { symbol: '$' });
    assert.equal(typeof money.bottomCalc, 'function');
    assert.equal(withTotal({ field: 'share', formatter: 'percent' }).bottomCalc, undefined);
    assert.equal(withTotal({ field: 'n', bottomCalc: 'avg' }).bottomCalc, 'avg');
  });

  test('made-up columns get their total after the author\'s own definition', () => {
    const opts: any = { rbTotals: true, autoColumns: true, autoColumnsDefinitions: [{ field: 'n', title: 'Orders' }] };
    applyTableExtras(opts);
    assert.equal(opts.rbTotals, undefined, 'Tabulator never sees the key');
    const defs = opts.autoColumnsDefinitions([{ field: 'channel' }, { field: 'n' }]);
    assert.equal(defs[1].title, 'Orders');
    assert.equal(typeof defs[1].bottomCalc, 'function');
  });

  test('only well-formed highlight rules are drawn', () => {
    assert.deepEqual(highlightsOf({ rbHighlights: [
      { field: 'n', kind: 'bars' }, { field: 'n', kind: 'above' }, { field: '', kind: 'scale' },
      { field: 'n', kind: 'above', value: 5, color: 'green' }, { field: 'n', kind: 'sparkle' }] }),
    [{ field: 'n', kind: 'bars' }, { field: 'n', kind: 'above', value: 5, color: 'green' }]);
  });

  test('a scale darkens with the value, a bar grows with it, a rule colours past its line', () => {
    const range = { min: 0, max: 100 };
    assert.equal(highlightStyle({ field: 'n', kind: 'scale' }, 0, range), 'rgba(80, 158, 227, 0.08)');
    assert.equal(highlightStyle({ field: 'n', kind: 'scale' }, 100, range), 'rgba(80, 158, 227, 0.65)');
    assert.equal(highlightStyle({ field: 'n', kind: 'bars' }, 40, range),
      'linear-gradient(90deg, rgba(80, 158, 227, 0.35) 40%, transparent 40%)');
    assert.equal(highlightStyle({ field: 'n', kind: 'above', value: 50 }, 60, range), 'rgba(220, 38, 38, 0.25)');
    assert.equal(highlightStyle({ field: 'n', kind: 'above', value: 50 }, 40, range), '');
    assert.equal(highlightStyle({ field: 'n', kind: 'below', value: 50, color: 'green' }, 40, range), 'rgba(22, 163, 74, 0.25)');
  });

  test('the range of each highlighted column', () => {
    assert.deepEqual(rangesOf([{ n: 3 }, { n: '7' }, { n: null }], ['n', 'x']), { n: { min: 3, max: 7 } });
  });

  test('the row formatter colours each cell and says how', () => {
    const opts: any = { rbHighlights: [{ field: 'n', kind: 'above', value: 5 }] };
    const extras = applyTableExtras(opts);
    assert.ok(extras);
    const attrs: Record<string, string> = {};
    const el: any = { style: {}, setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; } };
    const row = { getTable: () => ({ getData: () => [{ n: 9 }, { n: 1 }] }), getCell: () => ({ getElement: () => el, getValue: () => 9 }) };
    opts.rowFormatter(row);
    assert.equal(el.style.background, 'rgba(220, 38, 38, 0.25)');
    assert.equal(attrs['data-rb-highlight'], 'above');

    const sums: any = { style: {}, setAttribute() { throw new Error('a total is not coloured'); }, removeAttribute() {} };
    opts.rowFormatter({ getElement: () => ({ classList: { contains: (c: string) => c === 'tabulator-calcs' } }),
      getCell: () => ({ getElement: () => sums, getValue: () => 99 }) });
    assert.deepEqual(sums.style, {});
  });

  test('columns handed over later carry their totals', () => {
    const extras = applyTableExtras({ rbTotals: true, columns: [{ field: 'n' }] });
    const later = extras!.columns([{ field: 'n', formatter: () => 'x' }]) as any[];
    assert.equal(typeof later[0].bottomCalc, 'function');
    assert.equal(typeof later[0].bottomCalcFormatter, 'function');
  });

  test('a table with neither is left as it was', () => {
    const opts: any = { layout: 'fitColumns' };
    assert.equal(applyTableExtras(opts), null);
    assert.deepEqual(opts, { layout: 'fitColumns' });
  });
});

describe('a column is never squeezed to two letters', () => {
  test('a table with no column defaults gets the floor', () => {
    const opts: any = { layout: 'fitColumns' };
    withColumnFloor(opts);
    assert.deepEqual(opts.columnDefaults, { minWidth: COLUMN_FLOOR_PX });
  });

  test('the author\'s own column defaults win, and are kept', () => {
    const opts: any = { columnDefaults: { minWidth: 40, headerSort: false } };
    withColumnFloor(opts);
    assert.deepEqual(opts.columnDefaults, { minWidth: 40, headerSort: false });
  });
});

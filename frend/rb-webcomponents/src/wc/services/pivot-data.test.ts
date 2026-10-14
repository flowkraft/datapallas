// How a pivot writes the numbers in its cells.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/wc/services/pivot-data.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { pivotCellFormat, usFmt, usFmtInt, usFmtPct } from './pivot-data.ts';

describe('a pivot cell', () => {
  test('a whole sum has no decimals', () => {
    assert.equal(usFmt(417), '417');
    assert.equal(usFmt(13868), '13,868');
    assert.equal(usFmt(0), '0');
  });

  test('a fraction keeps two', () => {
    assert.equal(usFmt(83.333333), '83.33');
    assert.equal(usFmt(1234.5), '1,234.50');
  });

  test('counts and shares as before', () => {
    assert.equal(usFmtInt(2563.4), '2,563');
    assert.equal(usFmtPct(0.4912), '49.1%');
    assert.equal(usFmt(NaN), '');
  });
});

describe('a pivot', () => {
  test('of whole cells writes them whole', () => {
    const write = pivotCellFormat(usFmt, [417, 2563, null]);
    assert.equal(write(417), '417');
    assert.equal(write(12.5), '12.50');
  });

  test('with one fraction writes every cell with two decimals', () => {
    const write = pivotCellFormat(usFmt, [100, 99.1, 98]);
    assert.equal(write(100), '100.00');
    assert.equal(write(99.1), '99.10');
  });

  test('a formatter of its own is kept', () => {
    assert.equal(pivotCellFormat(usFmtInt, [1.5]), usFmtInt);
  });
});

// How a pivot writes the numbers in its cells.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/wc/services/pivot-data.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { usFmt, usFmtInt, usFmtPct } from './pivot-data.ts';

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

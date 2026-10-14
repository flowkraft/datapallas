// A KPI writes a plain number at the precision its size is read at, and a change of nothing as flat.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/kpi-format.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { kpiNumber, trendDelta } from './kpi-format.ts';

describe('a plain number on a KPI', () => {
  test('two decimals below a thousand', () => {
    assert.equal(kpiNumber(836.548, 'en-US'), '836.55');
    assert.equal(kpiNumber(4.07, 'en-US'), '4.07');
    assert.equal(kpiNumber(12, 'en-US'), '12');
  });

  test('none from a thousand up', () => {
    assert.equal(kpiNumber(2363956.2, 'en-US'), '2,363,956');
    assert.equal(kpiNumber(-1000.4, 'en-US'), '-1,000');
  });
});

describe('a change against the period before', () => {
  test('up and down keep their arrow', () => {
    assert.deepEqual(trendDelta(0.162), { text: '▲ 16.2% vs prior', tone: 'up' });
    assert.deepEqual(trendDelta(-0.558), { text: '▼ 55.8% vs prior', tone: 'down' });
  });

  test('a change that rounds to nothing is flat', () => {
    assert.deepEqual(trendDelta(0), { text: '0.0% vs prior', tone: 'flat' });
    assert.deepEqual(trendDelta(-0.0002), { text: '0.0% vs prior', tone: 'flat' });
  });
});

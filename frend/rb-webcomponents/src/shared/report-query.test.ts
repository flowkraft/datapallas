//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/report-query.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { reportQuery } from './report-query.ts';

describe('the query a tile asks its data with', () => {
  test('a filter nobody has set is left out, not sent as the word null', () => {
    assert.equal(reportQuery({ minAmount: 0, accountManagerId: null }).toString(), 'minAmount=0');
    assert.equal(reportQuery({ region: undefined }).toString(), '');
  });

  test('every value that is set goes as it is, an empty one and false included', () => {
    assert.equal(reportQuery({ a: '', b: false, c: 'x y', d: 3.5 }).toString(), 'a=&b=false&c=x+y&d=3.5');
  });

  test('no values at all is an empty query', () => {
    assert.equal(reportQuery(undefined).toString(), '');
    assert.equal(reportQuery({}).toString(), '');
  });
});

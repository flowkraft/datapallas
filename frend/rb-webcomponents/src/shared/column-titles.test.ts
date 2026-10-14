// A published table heads the columns it made from its data the way a reader writes them.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/column-titles.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readerTitle, withReaderTitles } from './column-titles.ts';

describe('the header of a column named by a query', () => {
  test('words joined by _ become words, the first one capitalised', () => {
    assert.equal(readerTitle('revenue_this_year'), 'Revenue this year');
    assert.equal(readerTitle('first_order_value'), 'First order value');
    assert.equal(readerTitle('product'), 'Product');
  });

  test('the short words a reader writes otherwise', () => {
    assert.equal(readerTitle('growth_pct'), 'Growth %');
    assert.equal(readerTitle('customer_id'), 'Customer ID');
    assert.equal(readerTitle('sku'), 'SKU');
  });

  test('a name written for the reader already is kept', () => {
    assert.equal(readerTitle('On hand'), null);
    assert.equal(readerTitle('Days overdue'), null);
    assert.equal(readerTitle('OrderedAt'), null);
  });
});

describe('the column definitions of a table made from its data', () => {
  const rows = [{ product: 'Desk', growth_pct: 3.1, 'On hand': 4 }];

  test('each query-named column gets a title, in a new list when there was none', () => {
    assert.deepEqual(withReaderTitles(undefined, rows), [
      { field: 'product', title: 'Product' },
      { field: 'growth_pct', title: 'Growth %' },
    ]);
  });

  test('a definition the column has keeps everything, and a title it gives wins', () => {
    const fmt = () => '';
    const out = withReaderTitles([{ field: 'product', title: 'Item' }, { field: 'growth_pct', formatter: fmt }], rows) as any[];
    assert.equal(out[0].title, 'Item');
    assert.equal(out[1].title, 'Growth %');
    assert.equal(out[1].formatter, fmt);
  });

  test('definitions keyed by field stay keyed', () => {
    assert.deepEqual(withReaderTitles({ product: { width: 200 } }, rows), {
      product: { width: 200, title: 'Product' },
      growth_pct: { title: 'Growth %' },
    });
  });

  test('nothing to title, nothing changed; a function is left to make its own columns', () => {
    const none = [{ 'On hand': 1 }];
    assert.equal(withReaderTitles(undefined, none), undefined);
    const own = () => [];
    assert.equal(withReaderTitles(own, rows), own);
    assert.equal(withReaderTitles(undefined, []), undefined);
  });
});

//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/column-format.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { columnNumberFormat, formatColumnValue, withColumnNumberFormats } from './column-format.ts';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number, max: number) => n.toLocaleString(undefined, { maximumFractionDigits: max });

describe('a published table writes its numbers as the Canvas did', () => {
  test('money, shares and numbers with a fraction, as the Canvas picks them', () => {
    assert.deepEqual(columnNumberFormat('revenue', [null, 1326265.8]), { kind: 'currency', currency: 'USD' });
    assert.deepEqual(columnNumberFormat('revenue', [1200]), { kind: 'currency', currency: 'USD' });
    assert.deepEqual(columnNumberFormat('Amount EUR', [9.5]), { kind: 'currency', currency: 'EUR' });
    assert.deepEqual(columnNumberFormat('margin_pct', [0.31]), { kind: 'percentage' });
    // `\b` does not part `total_revenue`: the Canvas writes it as a plain number, so does this.
    assert.deepEqual(columnNumberFormat('total_revenue', [10, 10.5]), { kind: 'number' });
  });

  test('whole numbers, text, coordinates and durations are left as they came', () => {
    // An id or a year is not to read 123,349 or 2,024.
    assert.equal(columnNumberFormat('order_id', [123349, 123368]), null);
    assert.equal(columnNumberFormat('year', [2024]), null);
    assert.equal(columnNumberFormat('quantity', [2253, 471]), null);
    assert.equal(columnNumberFormat('revenue', ['1326265.8']), null);
    assert.equal(columnNumberFormat('country', ['Spain']), null);
    assert.equal(columnNumberFormat('lat', [48.85]), null);
    assert.equal(columnNumberFormat('ship_lng', [2.35]), null);
    assert.equal(columnNumberFormat('duration', [1200.5]), null);
  });

  test('each kind written as the Canvas writes it', () => {
    assert.equal(formatColumnValue(1326265.8, { kind: 'currency', currency: 'USD' }), usd(1326265.8));
    assert.equal(formatColumnValue(0.314, { kind: 'percentage' }), num(31.4, 1) + '%');
    assert.equal(formatColumnValue(42, { kind: 'percentage' }), '42%');
    assert.equal(formatColumnValue(2253, { kind: 'number' }), num(2253, 0));
    assert.equal(formatColumnValue(3.14159, { kind: 'number' }), num(3.14159, 2));
    assert.equal(formatColumnValue(null, { kind: 'number' }), '');
  });

  test('only the columns nobody formatted get a format, listed or keyed as they came', () => {
    const rows = [{ product: 'AeroDesk Pro', quantity: 2253, revenue: 1326265.8, weight: 1.25 }];
    const listed = withColumnNumberFormats([{ field: 'revenue', formatter: 'money' }, { field: 'product', title: 'Product' }], rows) as any[];
    assert.equal(listed.find((d) => d.field === 'revenue').formatter, 'money');
    assert.equal(listed.find((d) => d.field === 'product').formatter, undefined);
    assert.equal(listed.find((d) => d.field === 'quantity'), undefined);
    const weight = listed.find((d) => d.field === 'weight');
    assert.equal(weight.formatter({ getValue: () => 1234.5 }), num(1234.5, 2));
    assert.equal(weight.hozAlign, 'right');

    const keyed = withColumnNumberFormats({ product: { title: 'Product' } }, rows) as Record<string, any>;
    assert.equal(keyed.product.title, 'Product');
    assert.equal(keyed.revenue.formatter({ getValue: () => 1326265.8 }), usd(1326265.8));
  });

  test('a table with no rows, or no number in them, is left as it is', () => {
    const defs = [{ field: 'country' }];
    assert.equal(withColumnNumberFormats(defs, []), defs);
    assert.equal(withColumnNumberFormats(defs, [{ country: 'Spain' }]), defs);
    assert.equal(withColumnNumberFormats(undefined, [{ country: 'Spain' }]), undefined);
    const own = (defs: unknown) => defs;
    assert.equal(withColumnNumberFormats(own, [{ revenue: 1 }]), own);
  });
});

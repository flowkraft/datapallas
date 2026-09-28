//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/cube-format.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatCell, formatMeasure, formatTime } from './cube-format.ts';

describe('a measure is written the way its cube declares it', () => {
  test('a currency is the cube currency, with cents', () => {
    assert.equal(formatMeasure(1234.5, 'currency'), '$1,234.50');
    assert.equal(formatMeasure(1234.5, 'currency', 'EUR'), '€1,234.50');
    // The sign stays outside the symbol, as it already does elsewhere.
    assert.ok(formatMeasure(-1234.5, 'currency').startsWith('-$'));
  });

  test('a percent is a fraction, and keeps what rounding to whole numbers would lose', () => {
    assert.equal(formatMeasure(0.34, 'percent'), '34.0%');
    assert.equal(formatMeasure(0.0811, 'percent'), '8.11%');
  });

  test('a number is grouped, and anything undeclared is left as it came', () => {
    assert.equal(formatMeasure(1234567, 'number'), '1,234,567');
    assert.equal(formatMeasure(1234567, ''), '1234567');
    assert.equal(formatMeasure('N/A', 'currency'), 'N/A');
  });

  test('nothing is not zero: an empty cell stays empty', () => {
    assert.equal(formatMeasure(null, 'currency'), '');
    assert.equal(formatMeasure(undefined, 'percent'), '');
    // Which is not the same answer as a real zero.
    assert.equal(formatMeasure(0, 'currency'), '$0.00');
  });
});

describe('a date column reads at the grain it was asked for', () => {
  test('each grain has its own label', () => {
    assert.equal(formatTime('2024-03-11', 'year'), '2024');
    assert.equal(formatTime('2024-03-11', 'quarter'), 'Q1 2024');
    assert.equal(formatTime('2024-03-11', 'month'), 'Mar 2024');
    assert.equal(formatTime('2024-03-11', 'week'), 'Week of Mar 11, 2024');
    assert.equal(formatTime('2024-03-11', 'day'), 'Mar 11, 2024');
  });

  test('a timestamp is read as text, so no time zone can move the day', () => {
    assert.equal(formatTime('2024-01-01 00:00:00', 'day'), 'Jan 1, 2024');
    assert.equal(formatTime('2024-12-31T23:30:00Z', 'month'), 'Dec 2024');
  });

  test('as is is what the database returned, and so is anything that is not a date', () => {
    assert.equal(formatTime('2024-03-11', ''), '2024-03-11');
    assert.equal(formatTime('not a date', 'month'), 'not a date');
    assert.equal(formatTime(null, 'month'), '');
  });
});

describe('a cell is written by what its column is', () => {
  test('a grain wins over a format, and a plain column is left alone', () => {
    assert.equal(formatCell('2024-03-11', { granularity: 'month' }), 'Mar 2024');
    assert.equal(formatCell(0.5, { format: 'percent' }), '50.0%');
    assert.equal(formatCell(12, { format: 'currency', currency: 'GBP' }), '£12.00');
    assert.equal(formatCell('Germany', { }), 'Germany');
    assert.equal(formatCell('Germany', undefined), 'Germany');
  });
});

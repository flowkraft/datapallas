//   npm test        (inside frend/rb-webcomponents)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { folderTip } from './folder-tips.ts';

describe('what a folder of the field tree says when it is hovered', () => {
  test('Measures: the numbers, and what to do next', () => {
    const tip = folderTip('measures');
    assert.match(tip, /^The numbers you want to see/);
    assert.match(tip, /group by/);
  });

  test('the main folder names the cube, says what grouping does and where the data is from', () => {
    const tip = folderTip('main', { title: 'Online Sales', source: 'cube_demo.shop_orders' });
    assert.match(tip, /^Online Sales: what to read the numbers by\./);
    assert.match(tip, /one row for each of its values/);
    assert.match(tip, /for grouping, not for adding up/);
    assert.match(tip, /\n\nData: cube_demo\.shop_orders$/);
    assert.match(folderTip('main'), /^What to read the numbers by\./);
    assert.doesNotMatch(folderTip('main'), /Data:/, 'no source, no line about it');
  });

  test('a long source is cut, on one line', () => {
    const tip = folderTip('main', { source: 'SELECT\n  a,\n  b FROM t ' + 'x'.repeat(400) });
    const line = tip.split('\n\nData: ')[1];
    assert.ok(line.length <= 160);
    assert.ok(line.endsWith('…'));
    assert.ok(!line.includes('\n'));
  });

  test('a joined table says how it meets the main one in words', () => {
    const tip = folderTip('join', { title: 'Customers', relationship: 'many_to_one' });
    assert.match(tip, /^Customers: more to read the numbers by/);
    assert.match(tip, /\n\nJoin: many to one$/);
    assert.doesNotMatch(folderTip('join', { title: 'Customers' }), /Join:/);
  });

  test('Filters narrow the answer, and Drill paths go one level deeper at a time', () => {
    assert.match(folderTip('filters'), /^Ready-made conditions prepared for this data cube/);
    assert.match(folderTip('filters'), /narrows the answer instead of adding a column/);
    assert.match(folderTip('drill'), /year → quarter → month/);
    assert.match(folderTip('drill'), /levels above it are ticked with it/);
  });
});

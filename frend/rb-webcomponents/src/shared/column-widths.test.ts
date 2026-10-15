//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/column-widths.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { authorSizedColumns, COLUMN_CAP_PX, CUT_FLOOR_PX, shareWidths, writeFittedWidth } from './column-widths.ts';
import { COLUMN_FLOOR_PX } from './table-extras.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('table columns as wide as what they hold', () => {
  test('everything fits: each column its own width, the room left shared out in proportion', () => {
    const r = shareWidths([100, 200, 100], 800)!;
    assert.equal(r.scroll, false);
    assert.equal(sum(r.widths), 800);
    assert.deepEqual(r.widths, [200, 400, 200]);
  });

  test('a short column is drawn no narrower than the floor', () => {
    const r = shareWidths([30, 300], 390)!;
    assert.equal(r.widths[0] >= COLUMN_FLOOR_PX, true);
    assert.equal(sum(r.widths), 390);
  });

  test('not everything fits: only the widest columns are cut, all to the same width', () => {
    // SKU, a long product name, category, warehouse, three numbers (DD19 "Stock by SKU").
    const natural = [110, 420, 150, 150, 110, 140, 180];
    const r = shareWidths(natural, 1200)!;
    assert.equal(r.scroll, false);
    assert.equal(sum(r.widths), 1200);
    assert.deepEqual(r.widths.slice(0, 1), [110], 'the SKU keeps its whole width');
    assert.equal(r.widths[1] < 420 && r.widths[1] > 300, true, 'only the product name is cut');
    assert.deepEqual([r.widths[2], r.widths[3], r.widths[4], r.widths[5], r.widths[6]], [150, 150, 110, 140, 180]);
  });

  test('no column is cut more than the even split would cut it', () => {
    const natural = [140, 160, 180, 90, 150, 120, 130, 150, 160, 120];
    const room = 1316;
    const r = shareWidths(natural, room)!;
    const even = Math.floor(room / natural.length);
    natural.forEach((w, i) => assert.equal(r.widths[i] >= Math.min(w, even), true, `column ${i}`));
    assert.equal(sum(r.widths), room);
  });

  test('when cutting would leave too little, the table scrolls with each column whole, up to a cap', () => {
    const r = shareWidths([90, 250, 160, 900], 340)!;
    assert.equal(r.scroll, true);
    assert.deepEqual(r.widths, [90, 250, 160, COLUMN_CAP_PX]);
    assert.equal(CUT_FLOOR_PX > COLUMN_FLOOR_PX, true);
  });

  test('an author floor is kept, cut or scrolled', () => {
    assert.deepEqual(shareWidths([50, 50], 400, [150, 90])!.widths.map((w) => w >= 90), [true, true]);
    assert.equal(shareWidths([50, 50], 400, [150, 90])!.widths[0] >= 150, true);
    assert.equal(shareWidths([400, 400], 300, [350, 90])!.widths[0], 350);
  });

  test('nothing to share: no columns, no room', () => {
    assert.equal(shareWidths([], 500), null);
    assert.equal(shareWidths([100], 0), null);
  });

  test('a table the author sized or grouped is theirs; widths written here are not the author\'s', () => {
    assert.equal(authorSizedColumns([{ field: 'a' }, { field: 'b' }]), false);
    assert.equal(authorSizedColumns([{ field: 'a', width: 120 }]), true);
    assert.equal(authorSizedColumns([{ field: 'a', widthGrow: 2 }]), true);
    assert.equal(authorSizedColumns([{ title: 'Group', columns: [{ field: 'a' }] }]), true);
    const def: Record<string, unknown> = { field: 'a' };
    writeFittedWidth(def, 140);
    assert.equal(def.width, 140);
    assert.equal(authorSizedColumns([def]), false);
    def.width = 200;
    assert.equal(authorSizedColumns([def]), true, 'changed since: the author\'s again');
  });
});

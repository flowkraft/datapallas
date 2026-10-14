// A heatmap cell paints its own background, so it takes the text colour that reads on it.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/readable-text.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { paintedCellStyle, readableTextOn } from './readable-text.ts';

describe('the text colour that reads on a background', () => {
  test('dark text on the heatmap\'s near-white and red cells', () => {
    assert.equal(readableTextOn('rgb(255,250,250)'), '#111111');
    assert.equal(readableTextOn('rgb(255,0,0)'), '#111111');
    assert.equal(readableTextOn('#ffffff'), '#111111');
  });

  test('white text on a dark background', () => {
    assert.equal(readableTextOn('rgb(20,20,40)'), '#ffffff');
    assert.equal(readableTextOn('rgba(0, 0, 0, 0.5)'), '#ffffff');
    assert.equal(readableTextOn('#1e3a8a'), '#ffffff');
  });

  test('a colour it cannot read leaves the page\'s colour', () => {
    assert.equal(readableTextOn('red'), null);
    assert.equal(readableTextOn(''), null);
  });
});

describe('the style of a painted cell', () => {
  test('background and text together', () => {
    assert.equal(paintedCellStyle('rgb(255,240,240)'), ' style="background-color:rgb(255,240,240);color:#111111"');
  });

  test('an unpainted cell has no style', () => {
    assert.equal(paintedCellStyle(undefined), '');
    assert.equal(paintedCellStyle(''), '');
  });

  test('a colour it cannot read is painted, the text left alone', () => {
    assert.equal(paintedCellStyle('red'), ' style="background-color:red"');
  });
});

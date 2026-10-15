//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/redraw-on-resize.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { redrawOnResize, resized } from './redraw-on-resize.ts';

describe('a widget drawn again when its box changes size', () => {
  test('a box 2 px or more off the drawn one is drawn again; a hidden one is not', () => {
    assert.equal(resized({ width: 1316, height: 300 }, { width: 340, height: 300 }), true);
    assert.equal(resized({ width: 340, height: 300 }, { width: 341, height: 300 }), false);
    assert.equal(resized({ width: 340, height: 300 }, { width: 340, height: 360 }), true);
    assert.equal(resized({ width: 340, height: 300 }, { width: 0, height: 0 }), false);
  });

  test('the first report is the drawn size; a later change draws once a frame; stop ends it', () => {
    let report: (entries: Array<{ contentRect: { width: number; height: number } }>) => void = () => {};
    let disconnected = false;
    const g = globalThis as Record<string, unknown>;
    const saved = { ro: g.ResizeObserver, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
    g.ResizeObserver = class {
      constructor(cb: typeof report) { report = cb; }
      observe() {}
      disconnect() { disconnected = true; }
    };
    const frames: Array<() => void> = [];
    g.requestAnimationFrame = (cb: () => void) => frames.push(cb);
    g.cancelAnimationFrame = (id: number) => { frames[id - 1] = () => {}; };
    try {
      let draws = 0;
      const stop = redrawOnResize({} as Element, () => { draws++; });
      report([{ contentRect: { width: 1316, height: 300 } }]);
      assert.equal(frames.length, 0, 'the size it was drawn at');
      report([{ contentRect: { width: 600, height: 300 } }]);
      report([{ contentRect: { width: 340, height: 300 } }]);
      frames.forEach((f) => f());
      assert.equal(draws, 1, 'two reports in one frame draw once');
      report([{ contentRect: { width: 341, height: 300 } }]);
      assert.equal(frames.length, 2, 'a pixel is not worth a drawing');
      stop();
      assert.equal(disconnected, true);
    } finally {
      g.ResizeObserver = saved.ro;
      g.requestAnimationFrame = saved.raf;
      g.cancelAnimationFrame = saved.caf;
    }
  });
});

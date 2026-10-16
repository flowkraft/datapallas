//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/tour-art.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { celebrateSvg, confettiPieces } from './tour-art.ts';

describe('the picture at the end of a tour', () => {
  const svg = celebrateSvg();

  test('it is one SVG with Leo in his three poses, the chart, the confetti and the sparkles in it', () => {
    assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'));
    assert.equal((svg.match(/class="rbta-bar"/g) ?? []).length, 5);
    assert.equal((svg.match(/class="rbta-confetti"/g) ?? []).length, confettiPieces().length);
    assert.equal((svg.match(/class="rbta-sparkle"/g) ?? []).length, 5);
    for (const part of ['rbta-line', 'rbta-dot', 'rbta-bulb', 'rbta-bubble', 'rbta-sweat']) assert.ok(svg.includes(part), part);
    assert.equal((svg.match(/class="rbta-q"/g) ?? []).length, 3);
    for (const pose of ['confused', 'thinking', 'excited']) assert.equal((svg.match(new RegExp('rbta-pose-' + pose, 'g')) ?? []).length, 1, pose);
    // Leo is the video series' own drawing: his headband and his tunic are in it.
    assert.ok(svg.includes('#c8483a') && svg.includes('#f0d8b0'));
  });

  test('it holds nothing a page could run, and no address to load', () => {
    assert.ok(!/<script|on\w+=|href=|<image|<foreignObject/i.test(svg));
  });

  test('it is the same picture every time, so it can be tested and cached', () => {
    assert.equal(celebrateSvg(), svg);
  });

  test('the confetti is spread round the whole burst, and goes off one piece after another', () => {
    const pieces = confettiPieces();
    assert.ok(pieces.some((p) => p.dx > 30) && pieces.some((p) => p.dx < -30));
    assert.ok(pieces.some((p) => p.dy > 20) && pieces.some((p) => p.dy < -20));
    const delays = pieces.map((p) => p.delay);
    assert.deepEqual([...delays].sort((a, b) => a - b), delays);
    assert.equal(new Set(pieces.map((p) => p.shape)).size, 3);
  });
});

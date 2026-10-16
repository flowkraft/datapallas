/**
 * The picture at the end of a tour: Leo - the learner of the Learn SQL videos - meets a chart he does
 * not understand (puzzled, question marks, a sweat drop), works it out (hand on the chin, a light bulb
 * flickering on) and gets it (jumps, bulb blazing, "Got it!", the chart builds itself, confetti).
 * Plain SVG - no image to load, nothing to download. The drawings of Leo are the video series' own
 * (`leo-poses.ts`); `RbTour.wc.svelte` carries the CSS that moves it (the `.rbta-*` classes), and with
 * `prefers-reduced-motion` it shows the last frame - Leo delighted, the chart built - still.
 *
 * The markup is built from fixed numbers and fixed words, never from user text, so it is safe as HTML.
 */

import { LEO_POSES } from './leo-poses.ts';

const CONFETTI_COUNT = 18;
/** Fill colours of the confetti; the first is the page's accent. */
const CONFETTI_FILLS = ['var(--rb-accent, var(--color-primary, #5b8def))', '#f5b942', '#34d399', '#f472b6', '#60a5fa'];
/** Where the confetti leaves from: just above Leo's head, where the light bulb is. */
const BURST = { x: 90, y: 26 };

/** One piece of confetti: where it flies to (`--dx`, `--dy`), how far it turns (`--r`), and when it goes. */
export function confettiPieces(): Array<{ dx: number; dy: number; rot: number; delay: number; shape: 'dot' | 'bar' | 'chip'; fill: string }> {
  const pieces = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + (i % 2) * 0.22;
    const reach = 58 + ((i * 37) % 5) * 13;
    pieces.push({
      dx: Math.round(Math.cos(angle) * reach),
      // The burst goes up first, and gravity brings it down: the end of the flight adds the fall.
      dy: Math.round(Math.sin(angle) * reach * 0.55 - 14),
      rot: 90 + ((i * 53) % 270),
      // Leo's jump starts at 3.05 s (see `.rbta-leo` in RbTour.wc.svelte): the confetti goes off at its top.
      delay: Math.round((3.2 + i * 0.018) * 1000) / 1000,
      shape: (['dot', 'bar', 'chip'] as const)[i % 3],
      fill: CONFETTI_FILLS[i % CONFETTI_FILLS.length],
    });
  }
  return pieces;
}

/** The four-pointed star of a sparkle, centred on 0,0. */
const STAR = 'M0,-8 L2.2,-2.2 L8,0 L2.2,2.2 L0,8 L-2.2,2.2 L-8,0 L-2.2,-2.2 Z';
const SPARKLES: Array<[number, number, number]> = [[24, 46, 3.5], [312, 62, 3.8], [286, 22, 4.1], [330, 150, 3.65], [158, 160, 3.95]];

/** The question marks over a puzzled Leo: where, and when each one comes. */
const QUESTION_MARKS: Array<[number, number, number]> = [[40, 56, 0.1], [128, 50, 0.45], [96, 8, 0.8]];

/** Rays of the light bulb, as lines from the glass outwards. */
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const at = (r: number) => `${(90 + Math.cos(a) * r).toFixed(1)},${(20 + Math.sin(a) * r).toFixed(1)}`;
  return `M${at(14)} L${at(19)}`;
});

/** The chart on the board next to Leo: bars and the points of the trend line over them. */
const BAR_HEIGHTS = [22, 34, 28, 48, 62];
const BAR_X0 = 204;
const BAR_STEP = 23;
const BAR_WIDTH = 16;
const BASELINE = 178;

export function celebrateSvg(): string {
  const bars = BAR_HEIGHTS.map((h, i) =>
    `<rect class="rbta-bar" style="--i:${i};opacity:${(0.5 + i * 0.12).toFixed(2)}" x="${BAR_X0 + i * BAR_STEP}" y="${BASELINE - h}" width="${BAR_WIDTH}" height="${h}" rx="3"/>`,
  ).join('');

  const tops = BAR_HEIGHTS.map((h, i) => [BAR_X0 + i * BAR_STEP + BAR_WIDTH / 2, BASELINE - h - 9] as const);
  const line = tops.map(([x, y], i) => (i === 0 ? 'M' : 'L') + x + ',' + y).join(' ');
  const [endX, endY] = tops[tops.length - 1];

  const confetti = confettiPieces().map((p) => {
    const style = `--dx:${p.dx}px;--dy:${p.dy}px;--r:${p.rot}deg;animation-delay:${p.delay}s;fill:${p.fill}`;
    if (p.shape === 'dot') return `<circle class="rbta-confetti" style="${style}" cx="${BURST.x}" cy="${BURST.y}" r="3.4"/>`;
    if (p.shape === 'bar') return `<rect class="rbta-confetti" style="${style}" x="${BURST.x - 3}" y="${BURST.y - 5}" width="6" height="10" rx="1.2"/>`;
    return `<rect class="rbta-confetti" style="${style}" x="${BURST.x - 2.5}" y="${BURST.y - 2.5}" width="5" height="5" rx="1"/>`;
  }).join('');

  const sparkles = SPARKLES.map(([x, y, delay]) =>
    `<path class="rbta-sparkle" style="animation-delay:${delay}s" transform="translate(${x} ${y})" d="${STAR}"/>`,
  ).join('');

  const questions = QUESTION_MARKS.map(([x, y, delay]) =>
    `<text class="rbta-q" style="animation-delay:${delay}s" x="${x}" y="${y}">?</text>`,
  ).join('');

  const rays = RAYS.map((d) => `<path d="${d}"/>`).join('');

  return (
    `<svg class="rbta" viewBox="0 0 340 210" role="img" aria-label="Leo works out how Show Me works" xmlns="http://www.w3.org/2000/svg">` +
    `<circle class="rbta-glow" cx="90" cy="112" r="80"/>` +
    // The board with the chart Leo is looking at.
    `<rect class="rbta-board" x="190" y="84" width="136" height="104" rx="9"/>` +
    `<rect class="rbta-label" x="204" y="95" width="58" height="6" rx="3"/>` +
    `<line class="rbta-base" x1="200" y1="${BASELINE}" x2="316" y2="${BASELINE}"/>` +
    bars +
    `<path class="rbta-line" pathLength="1" d="${line}"/>` +
    `<circle class="rbta-dot" cx="${endX}" cy="${endY}" r="4"/>` +
    // Leo: the stage, then the three poses on top of each other - only one is seen at a time.
    `<ellipse class="rbta-floor" cx="90" cy="204" rx="40" ry="5"/>` +
    `<g class="rbta-leo"><g class="rbta-bob"><g transform="translate(18 14) scale(0.36)">` +
    `<g class="rbta-pose rbta-pose-confused">${LEO_POSES.confused}</g>` +
    `<g class="rbta-pose rbta-pose-thinking">${LEO_POSES.thinking}</g>` +
    `<g class="rbta-pose rbta-pose-excited">${LEO_POSES.excited}</g>` +
    `</g></g></g>` +
    `<path class="rbta-sweat" d="M118,58 q6,9 0,14 q-6,-5 0,-14 z"/>` +
    questions +
    // The idea: a bulb that flickers on while he thinks and blazes when he gets it.
    `<g class="rbta-bulb">` +
    `<g class="rbta-rays">${rays}</g>` +
    `<circle class="rbta-glass" cx="90" cy="20" r="8"/><rect class="rbta-cap" x="86" y="27" width="8" height="5" rx="1.5"/></g>` +
    // What he says.
    `<g class="rbta-bubble"><path d="M161,12 h83 a9,9 0 0 1 9,9 v14 a9,9 0 0 1 -9,9 h-70 l-26,16 l10,-16 h-17 a9,9 0 0 1 -9,-9 v-14 a9,9 0 0 1 9,-9 z"/>` +
    `<text x="193" y="34" text-anchor="middle">Got it!</text></g>` +
    confetti +
    sparkles +
    `</svg>`
  );
}

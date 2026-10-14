/**
 * The scales a chart's theme colours are written onto, when its configuration names none.
 *
 * The page's text and grid colours go on every scale a chart has. A chart that names no scales used
 * to be given an empty `x` and `y` to colour, whatever its type - and Chart.js draws every scale it
 * is given, so each pie and doughnut of the demos sat on a set of cartesian axes it has no use for
 * (DD04, DD09, DD11, DD13, DD17, DD25). The scales a chart is given are the ones its type draws:
 * none for a pie or a doughnut, the one radial scale for a polar area or a radar, x and y for the
 * rest. Scales the author named are theirs and are kept as they are.
 *
 * Pure, so `npm test` asks it directly - see chart-scales.test.ts.
 */

/** Drawn on a circle with no scale at all. */
const NO_SCALE_TYPES = new Set(['pie', 'doughnut']);

/** Drawn on a circle with one radial scale, `r`. */
const RADIAL_TYPES = new Set(['polarArea', 'radar']);

/**
 * @returns a copy of the scales the chart names, or, when it names none, the empty scales its type
 *          draws
 */
export function scalesToTheme(type: string, scales: Record<string, any> | undefined): Record<string, any> {
  if (scales) return { ...scales };
  if (NO_SCALE_TYPES.has(type)) return {};
  if (RADIAL_TYPES.has(type)) return { r: {} };
  return { x: {}, y: {} };
}

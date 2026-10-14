/**
 * The scales a chart's theme colours are written onto, when its configuration names none.
 *
 * The page's text and grid colours go on every scale a chart has. A chart that names no scales used
 * to be given an empty `x` and `y` to colour, whatever its type - and Chart.js draws every scale it
 * is given, so each pie and doughnut of the demos sat on a set of cartesian axes it has no use for
 * (DD04, DD09, DD11, DD13, DD17, DD25). The scales a chart is given are the ones its type draws:
 * none for a pie or a doughnut, the one radial scale for a polar area or a radar, x and y for the
 * rest. Scales the author named are theirs and are kept as they are, beside the ones the type draws
 * that the author did not name: a bar chart naming only its `y` (DD19's space used, to 100) drew
 * its `x` in Chart.js's grey on the dark page, as no colour was ever given to it.
 *
 * Pure, so `npm test` asks it directly - see chart-scales.test.ts.
 */

/** Drawn on a circle with no scale at all. */
const NO_SCALE_TYPES = new Set(['pie', 'doughnut']);

/** Drawn on a circle with one radial scale, `r`. */
const RADIAL_TYPES = new Set(['polarArea', 'radar']);

/**
 * @returns the empty scales the chart's type draws, with the ones the chart names over them (a copy)
 */
export function scalesToTheme(type: string, scales: Record<string, any> | undefined): Record<string, any> {
  const drawn: Record<string, any> = NO_SCALE_TYPES.has(type) ? {} : (RADIAL_TYPES.has(type) ? { r: {} } : { x: {}, y: {} });
  return scales ? { ...drawn, ...scales } : drawn;
}

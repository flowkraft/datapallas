/**
 * Whether a chart shows its legend, when its configuration does not say.
 *
 * A legend tells series apart. A chart of one series has nothing to tell apart, so its legend only
 * repeated the title ("Revenue" under "Revenue per month", `base_salary_annual` under a boxplot) on
 * most charts of the demos. The rule is Explore Data's (`shouldShowLegend`: a legend from two series
 * up). A pie, a doughnut and a polar area are one series whose legend names the slices, so they keep
 * it. A legend the author switched on or off is theirs.
 *
 * Pure, so `npm test` asks it directly - see chart-legend.test.ts.
 */

import { readableLabelWriter } from './chart-axes.ts';

/** One series whose legend names its slices, not its series. */
const SLICE_TYPES = new Set(['pie', 'doughnut', 'polarArea']);

/**
 * @param declared the legend's `display` as the configuration wrote it (undefined when it says
 *                 nothing)
 */
export function legendShown(type: string, seriesCount: number, declared: unknown): boolean {
  if (typeof declared === 'boolean') return declared;
  if (SLICE_TYPES.has(type)) return true;
  return seriesCount > 1;
}

/** Marks a legend this rule hid, so the next draw decides again (a filter can bring a second series). */
const AUTO_HIDDEN = 'rbAutoHidden';

/**
 * The chart's legend options with the rule applied: hidden, and marked so, when the configuration
 * says nothing and one series has nothing to tell apart; shown again, the mark gone, when a later
 * draw has more. A chart redrawn keeps its earlier options, so a legend this rule hid must not read
 * as one the author switched off.
 *
 * @returns `legend` itself when nothing changes
 */
export function withLegendRule(type: string, seriesCount: number, legend: Record<string, any> | undefined): Record<string, any> | undefined {
  const auto = legend?.[AUTO_HIDDEN] === true;
  const declared = auto ? undefined : legend?.display;
  const shown = legendShown(type, seriesCount, declared);
  if (!shown && declared === undefined && !auto) return { ...(legend || {}), display: false, [AUTO_HIDDEN]: true };
  if (shown && auto) {
    const { display: _display, [AUTO_HIDDEN]: _auto, ...kept } = legend as Record<string, any>;
    return kept;
  }
  return legend;
}

/**
 * The name of a series drawn from one value of a split-by column: the value itself, which is what
 * the reader picked or filters by. It was `field (value)` (`share_pct (marketplace)`,
 * `customer_id_count (organic)`): the column name of the query in front of every legend entry and
 * tooltip.
 */
export function splitSeriesName(value: string): string {
  return value === '' ? '(none)' : value;
}

/**
 * A legend's item maker that writes the items' names as the chart's axis writes its labels
 * (chart-axes `readableLabelWriter`): `sales_rep` reads "Sales rep", and beside it `web` reads
 * "Web", on a pie's legend as on a chart split by a column. Only the text changes: the item keeps
 * what a click on it toggles.
 *
 * @param generate the legend's own item maker (Chart.js's, for the chart's type)
 */
export function readableLegend(generate: (chart: any) => any[]): (chart: any) => any[] {
  const wrapped = function (this: any, chart: any) {
    const items = generate.call(this, chart) || [];
    const write = readableLabelWriter(items.map((item: any) => item?.text));
    return write ? items.map((item: any) => ({ ...item, text: write(item.text) })) : items;
  };
  return wrapped;
}

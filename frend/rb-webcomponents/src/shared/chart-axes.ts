/**
 * Two things a chart's category and value axes say that the query cannot.
 *
 * Dates. A query that groups by `date_trunc('month', ...)` hands the chart a date (`2024-01-01`, or
 * `2024-01-01T00:00:00`) per month, and the axis wrote each one in full, rotated, 33 times a chart:
 * the demos that bucket with `strftime('%Y-%m')` read `2024-01` instead. A category axis whose labels
 * are all such dates writes them the way the bucket means them: `2024-01` for months, `2024 Q1` for
 * quarters, the date without its midnight for days and weeks. Only what is written changes: the
 * labels themselves stay the values a click filters by.
 *
 * Shares. A stacked chart of shares (`share_pct` per channel and month) adds up to 100 in every stack,
 * yet Chart.js rounds its value axis up to 120. A stacked chart whose every stack totals 100 (to the
 * rounding of its values) ends its axis at 100, as the 100% stacked mode does (stack-percent.ts).
 *
 * Pure, so `npm test` asks it directly - see chart-axes.test.ts.
 */

import { scalesToTheme } from './chart-scales.ts';

/** A date, and at most a midnight after it: what a date_trunc bucket serialises to. */
const BUCKET_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/;

/** No axis of categories to write: a pie names its slices in its legend, a radar on its own scale. */
const NO_CATEGORY_AXIS = new Set(['pie', 'doughnut', 'polarArea', 'radar']);

/**
 * @returns how to write the labels when every one is a date bucket, or null when they are not all
 *          dates (they are written as they are)
 */
export function dateLabelWriter(labels: unknown[] | undefined): ((label: unknown) => string) | null {
  if (!Array.isArray(labels) || labels.length === 0) return null;
  const parts = labels.map((label) => BUCKET_DATE_RX.exec(String(label ?? '')));
  if (parts.some((p) => !p)) return null;
  const firsts = parts.every((p) => p![3] === '01');
  const months = parts.map((p) => Number(p![1]) * 12 + Number(p![2]) - 1);
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((m, i) => m - sorted[i]);
  const quarters = firsts && sorted.length > 1 && parts.every((p) => (Number(p![2]) - 1) % 3 === 0)
    && gaps.every((gap) => gap % 3 === 0);
  return (label: unknown) => {
    const p = BUCKET_DATE_RX.exec(String(label ?? ''));
    if (!p) return String(label ?? '');
    if (quarters) return `${p[1]} Q${(Number(p[2]) - 1) / 3 + 1}`;
    if (firsts) return `${p[1]}-${p[2]}`;
    return `${p[1]}-${p[2]}-${p[3]}`;
  };
}

/**
 * Write a built chart's date labels as their buckets, in place: the category axis's ticks and the
 * tooltip's title. A tick or title callback the configuration already has is left to it.
 */
export function applyDateLabels(config: any): void {
  if (!config || NO_CATEGORY_AXIS.has(config.type)) return;
  const write = dateLabelWriter(config.data?.labels);
  if (!write) return;
  const options = (config.options = { ...(config.options || {}) });
  const axis = options.indexAxis === 'y' ? 'y' : 'x';
  const scales = (options.scales = { ...(options.scales || scalesToTheme(config.type, undefined)) });
  const scale = (scales[axis] = { ...(scales[axis] || {}) });
  const ticks = (scale.ticks = { ...(scale.ticks || {}) });
  // A weekly axis has 50 dates and rotated them all: one reading line, Chart.js skipping what does not fit.
  if (ticks.maxRotation === undefined) ticks.maxRotation = 0;
  if (ticks.autoSkip === undefined) ticks.autoSkip = true;
  if (ticks.callback === undefined) {
    ticks.callback = function (this: any, value: unknown, index: number) {
      const label = typeof this?.getLabelForValue === 'function' ? this.getLabelForValue(value) : config.data?.labels?.[index];
      return write(label);
    };
  }
  const plugins = (options.plugins = { ...(options.plugins || {}) });
  const tooltip = (plugins.tooltip = { ...(plugins.tooltip || {}) });
  const callbacks = (tooltip.callbacks = { ...(tooltip.callbacks || {}) });
  if (callbacks.title === undefined) callbacks.title = (items: any[]) => (items && items.length ? write(items[0].label) : '');
}

const numberOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** How far a stack of rounded shares may miss 100 and still be one. */
const SHARE_ROUNDING = 0.5;

/** Whether every stack of these datasets totals 100: a stacked chart of shares. */
export function stacksAreShares(datasets: { data?: unknown[] }[] | undefined): boolean {
  if (!Array.isArray(datasets) || datasets.length < 2) return false;
  const length = Math.max(0, ...datasets.map((ds) => ds.data?.length ?? 0));
  if (length === 0) return false;
  for (let j = 0; j < length; j++) {
    const total = datasets.reduce((sum, ds) => sum + numberOf(ds.data?.[j]), 0);
    if (Math.abs(total - 100) > SHARE_ROUNDING) return false;
  }
  return true;
}

/**
 * End the value axis of a stacked chart of shares at 100, in place. A range the configuration
 * names is left to it, and so is a chart drawn as 100% stacked, which sets its own.
 */
export function applyShareStackMax(config: any): void {
  if (!config || NO_CATEGORY_AXIS.has(config.type)) return;
  const options = config.options || {};
  if (options.rbStack100 === true) return;
  const valueAxis = options.indexAxis === 'y' ? 'x' : 'y';
  const scale = options.scales?.[valueAxis];
  if (!scale || scale.stacked !== true || scale.max !== undefined) return;
  if (!stacksAreShares(config.data?.datasets)) return;
  options.scales = { ...options.scales, [valueAxis]: { ...scale, min: scale.min ?? 0, max: 100 } };
  config.options = options;
}

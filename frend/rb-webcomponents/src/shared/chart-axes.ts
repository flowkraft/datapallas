/**
 * What a chart's category and value axes say that the query cannot: its dates, its shares, the
 * values kept the database's way, and the room its bubbles need.
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

/** A value as the database keeps it: lower-case words joined by `_` (`paid_social`, `sales_rep`). */
const SNAKE_VALUE_RX = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** `paid_social` as a reader writes it: `Paid social`. Anything else as it is. */
export function readableValue(label: unknown): string {
  const text = String(label ?? '');
  if (!SNAKE_VALUE_RX.test(text)) return text;
  const words = text.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One lower-case word, as the database keeps a value (`web`, `marketplace`). */
const LOWER_WORD_RX = /^[a-z][a-z0-9]*$/;

/**
 * @returns how to write labels some of which are kept the database's way (`paid_social`), or null
 *          when none is (they are written as they are). Beside them, a value of one lower-case word
 *          is written with its capital too, so one axis does not read "web" beside "Sales rep".
 */
export function readableLabelWriter(labels: unknown[] | undefined): ((label: unknown) => string) | null {
  if (!Array.isArray(labels) || !labels.some((label) => SNAKE_VALUE_RX.test(String(label ?? '')))) return null;
  return (label: unknown) => {
    const text = String(label ?? '');
    return LOWER_WORD_RX.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : readableValue(text);
  };
}

/** One series whose slices are named by the labels: its tooltip names the slice, not the series. */
const SLICE_TYPES = new Set(['pie', 'doughnut', 'polarArea']);

/**
 * Write a built chart's labels for a reader, in place: date buckets as their buckets, values kept
 * the database's way in words (`paid_social` reads `Paid social`). The category axis's ticks and
 * the tooltip's title; the names of the series of a chart split by a column, and of a pie's slices,
 * in the tooltip. A tick, title or label callback the configuration already has is left to it. The
 * labels themselves are not touched: a click filters by the value as the database has it.
 */
export function applyDateLabels(config: any): void {
  if (!config) return;
  if (!NO_CATEGORY_AXIS.has(config.type)) {
    writeCategoryAxis(config);
    shortenRowNames(config);
  }
  writeScatterPoints(config);
  writeSeriesNames(config);
}

/**
 * A scatter point's tooltip: its series and its value up the chart ("Units sold: 330"), under its
 * value across as the title. Chart.js wrote the two as one tuple, "Units sold: (2.8, 330)" (DD05).
 * A label callback the configuration has is left to it.
 */
function writeScatterPoints(config: any): void {
  if (config.type !== 'scatter') return;
  const write = readableLabelWriter((config.data?.datasets ?? []).map((ds: any) => ds?.label)) ?? ((v: unknown) => String(v ?? ''));
  const options = (config.options = { ...(config.options || {}) });
  const plugins = (options.plugins = { ...(options.plugins || {}) });
  const tooltip = (plugins.tooltip = { ...(plugins.tooltip || {}) });
  const callbacks = (tooltip.callbacks = { ...(tooltip.callbacks || {}) });
  if (callbacks.label !== undefined) return;
  callbacks.label = (item: any) => {
    const y = item?.parsed?.y;
    const scale = item?.chart?.scales?.[item?.dataset?.yAxisID ?? 'y'];
    const value = typeof y !== 'number' ? String(item?.formattedValue ?? '')
      : typeof scale?.getLabelForValue === 'function' ? String(scale.getLabelForValue(y)) : y.toLocaleString();
    const name = item?.dataset?.label;
    return name == null || name === '' ? value : `${write(name)}: ${value}`;
  };
}

/** About the width of one character of a tick label, in pixels (Chart.js's 12 px sans-serif): the
 *  guess when there is no canvas to measure a name on. */
const TICK_CHAR_PX = 7;

/** The share of a row chart's width its names may take. */
const ROW_NAMES_SHARE = 0.4;

/** A label cut to `max` characters, its end written "…"; a label that fits, as it is. */
export function shortenLabel(text: string, max: number): string {
  if (max < 4 || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * The names down a row chart's axis (horizontal bars), never wider than 40% of the chart. Chart.js
 * gives that axis only its share of the width and draws a longer name past the chart's left edge,
 * cut: "7 Pikaro Conference One 532" (DD19's slow movers at 390 px). The start of a name is what
 * tells the rows apart, so it is the end that goes; the tooltip still names the row in full.
 * A name is measured in the axis's own font: guessed at 7 px a letter, names that fitted lost their
 * last characters ("AUD-0157 Pikaro Conference One 5…", "Other departments (2…") in a Gallery card.
 */
function shortenRowNames(config: any): void {
  if (config.options?.indexAxis !== 'y') return;
  const options = (config.options = { ...config.options });
  const scales = (options.scales = { ...(options.scales || scalesToTheme(config.type, undefined)) });
  const scale = (scales.y = { ...(scales.y || {}) });
  const ticks = (scale.ticks = { ...(scale.ticks || {}) });
  const inner = ticks.callback;
  if (inner?.rbShortRowNames) return;
  const shortened = function (this: any, value: unknown, index: number, all: unknown[]) {
    const label = typeof inner === 'function' ? inner.call(this, value, index, all)
      : typeof this?.getLabelForValue === 'function' ? this.getLabelForValue(value) : config.data?.labels?.[index];
    const width = Number(this?.chart?.width) || 0;
    if (typeof label !== 'string' || width <= 0) return label;
    const room = width * ROW_NAMES_SHARE;
    const measure = tickTextWidth(this, index);
    if (!measure) return shortenLabel(label, Math.floor(room / TICK_CHAR_PX));
    let max = label.length;
    while (max >= 4 && measure(shortenLabel(label, max)) > room) max--;
    return shortenLabel(label, max);
  };
  shortened.rbShortRowNames = true;
  ticks.callback = shortened;
}

/** How wide a text is drawn in a scale's tick font, or null when there is no canvas to measure on. */
function tickTextWidth(scale: any, index: number): ((text: string) => number) | null {
  const ctx = scale?.ctx ?? scale?.chart?.ctx;
  if (!ctx || typeof ctx.measureText !== 'function') return null;
  let font: string | undefined;
  try { font = scale._resolveTickFontOptions?.(index)?.string; } catch { font = undefined; }
  return (text: string) => {
    ctx.save();
    if (font) ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  };
}

/** The tooltip's name of a series or of a slice, written as the axis writes its labels. */
function writeSeriesNames(config: any): void {
  const slices = SLICE_TYPES.has(config.type);
  const names = slices ? config.data?.labels : (config.data?.datasets ?? []).map((ds: any) => ds?.label);
  const write = readableLabelWriter(names);
  if (!write) return;
  const options = (config.options = { ...(config.options || {}) });
  const plugins = (options.plugins = { ...(options.plugins || {}) });
  const tooltip = (plugins.tooltip = { ...(plugins.tooltip || {}) });
  const callbacks = (tooltip.callbacks = { ...(tooltip.callbacks || {}) });
  if (callbacks.label !== undefined) return;
  callbacks.label = (item: any) => {
    const name = slices ? item?.label : item?.dataset?.label;
    const value = String(item?.formattedValue ?? '');
    return name == null || name === '' ? value : `${write(name)}: ${value}`;
  };
}

function writeCategoryAxis(config: any): void {
  const dates = dateLabelWriter(config.data?.labels);
  const write = dates ?? readableLabelWriter(config.data?.labels);
  if (!write) return;
  const options = (config.options = { ...(config.options || {}) });
  const axis = options.indexAxis === 'y' ? 'y' : 'x';
  const scales = (options.scales = { ...(options.scales || scalesToTheme(config.type, undefined)) });
  const scale = (scales[axis] = { ...(scales[axis] || {}) });
  const ticks = (scale.ticks = { ...(scale.ticks || {}) });
  // A weekly axis has 50 dates and rotated them all: one reading line, Chart.js skipping what does not fit.
  if (dates && ticks.maxRotation === undefined) ticks.maxRotation = 0;
  if (dates && ticks.autoSkip === undefined) ticks.autoSkip = true;
  // And a gap between the dates it keeps: with Chart.js's 3 px they ran together on a phone
  // ("2024-012024-06", DD04, DD21).
  if (dates && ticks.autoSkipPadding === undefined) ticks.autoSkipPadding = 12;
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

/** The room a bubble chart leaves past its largest values, so its biggest bubbles stay whole. */
const BUBBLE_GRACE = '12%';

/**
 * Leave room for a bubble's radius at both ends of both axes, in place. Chart.js ends its axes at
 * the data and clips what lies beyond, so the bubble at the top was drawn cut off and over the
 * chart's title (DD05's AeroDesk Pro). A `grace` or a range the configuration names is left to it.
 */
export function applyBubbleRoom(config: any): void {
  if (!config || config.type !== 'bubble') return;
  const options = (config.options = { ...(config.options || {}) });
  const scales = (options.scales = { ...(options.scales || {}) });
  for (const axis of ['x', 'y']) {
    const scale = scales[axis] || {};
    if (scale.grace !== undefined || scale.min !== undefined || scale.max !== undefined) continue;
    scales[axis] = { ...scale, grace: BUBBLE_GRACE };
  }
}

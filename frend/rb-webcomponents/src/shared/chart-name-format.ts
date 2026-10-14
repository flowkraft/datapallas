/**
 * A chart that names no number format (`rbNumberFormat`, chart-number-format.ts) writes its money
 * and its shares the way their column's name says, as a table writes a column of that name
 * (column-format.ts): `Amount: 800,997.01` is `Amount: $800,997.01`, `Late %: 12.38` is
 * `Late %: 12.38%`, on the value axis and in the tooltip.
 *
 * The name is read word by word (`total_amount_sum` is total / amount / sum), not with the table's
 * `\b` rule, which no snake_case name past its first word ever matched. A share is a share of
 * whatever it counts (`pct_of_orders`); else a name with a counting word (`payment_count`,
 * `closed_deals`) is a count, whatever money it names. A share is a fraction when
 * every value of it is between -1 and 1 (0.34 is 34%), else it is already in points (34.2 is 34.2%).
 * The series on one axis have to say the same, or that axis is left as it is: a chart of orders on
 * its left axis and revenue on its right (`yAxisID`) writes only the right one as money. A value
 * axis of shares starts at 0 unless the configuration names where it starts: auto-ranged, a rate
 * between 40.90% and 41.04% was drawn as a steep fall (DD12).
 *
 * Pure, so `npm test` asks it directly - see chart-name-format.test.ts.
 */

import { chartNumberFormatOf } from './chart-number-format.ts';
import { stackPercentOn } from './stack-percent.ts';
import { readableLabelWriter } from './chart-axes.ts';

export type NamedKind = 'currency' | 'share' | '';

const MONEY_WORDS = new Set([
  'price', 'amount', 'cost', 'revenue', 'salary', 'fee', 'charge', 'payable', 'payment', 'income',
  'expense', 'balance', 'sales', 'profit', 'earnings', 'discount', 'tax', 'spend', 'owed', 'billed',
  'invoiced', 'margin', 'mrr', 'arr', 'aov', 'gmv', 'cogs',
]);
/** A word that is money only beside another word: `order_value`, `stuck_value`; a bare `value` says nothing. */
const MONEY_WITH_ANOTHER = new Set(['value']);
const SHARE_WORDS = new Set(['pct', 'percent', 'percentage', 'rate', 'ratio', 'share']);
const COUNT_WORDS = new Set([
  'count', 'number', 'qty', 'quantity', 'units', 'orders', 'tickets', 'deals', 'customers',
  'sessions', 'days', 'hours', 'minutes',
]);

/** What a measure's name says it is: money, a share, or nothing the chart can tell. */
export function namedKindOf(field: string): NamedKind {
  const words = String(field ?? '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => SHARE_WORDS.has(w))) return 'share';
  if (words.some((w) => COUNT_WORDS.has(w))) return '';
  if (words.some((w) => MONEY_WORDS.has(w))) return 'currency';
  if (words.length > 1 && words.some((w) => MONEY_WITH_ANOTHER.has(w))) return 'currency';
  return '';
}

/** How a chart's numbers are written by name: on its axis and in its tooltip. */
export interface NamedWriter {
  kind: NamedKind;
  axis: (v: number) => string;
  tooltip: (v: number) => string;
}

const numberOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The writer for a chart of these series fields and values, or null when the names do not agree. */
export function namedWriter(fields: string[], values: unknown[]): NamedWriter | null {
  if (fields.length === 0) return null;
  const kinds = new Set(fields.map(namedKindOf));
  if (kinds.size !== 1) return null;
  const kind = [...kinds][0];
  if (kind === 'currency') {
    const money = (digits: number) => (v: number) => v.toLocaleString('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
    return { kind, axis: (v) => money(Math.abs(v) >= 10 || v === 0 ? 0 : 2)(v), tooltip: money(2) };
  }
  if (kind === 'share') {
    const nums = values.map(numberOf).filter((v): v is number => v !== null);
    const fraction = nums.length > 0 && nums.every((v) => Math.abs(v) <= 1);
    const points = (digits: number) => (v: number) =>
      (fraction ? v * 100 : v).toLocaleString('en-US', { maximumFractionDigits: digits }) + '%';
    return { kind, axis: points(1), tooltip: points(2) };
  }
  return null;
}

const NO_VALUE_AXIS = new Set(['pie', 'doughnut', 'polarArea', 'radar']);
/** A point of these is two numbers or three: a name cannot say which one it is. */
const TUPLE_TYPES = new Set(['scatter', 'bubble', 'boxplot', 'violin']);

/**
 * Write a built chart's numbers by its series' names, in place, when it names no format of its
 * own: each value axis by the series drawn on it, the tooltip by each series' own axis. A tick or
 * tooltip callback the configuration has is left to it, and so is a start its value axis names.
 *
 * @param fields the query column of each series, in the order of the datasets; one field for a
 *               chart split by a column (every series is that field)
 */
export function applyNamedFormat(config: any, fields: string[]): void {
  if (!config || TUPLE_TYPES.has(config.type)) return;
  if (chartNumberFormatOf(config.options) || stackPercentOn(config.options)) return;
  const datasets: any[] = config.data?.datasets ?? [];
  const valuesOf = (ds: any) => (Array.isArray(ds?.data) ? ds.data : []);
  const options = { ...(config.options || {}) };
  const horizontal = options.indexAxis === 'y';
  const pie = NO_VALUE_AXIS.has(config.type);
  const valueAxis = horizontal ? 'x' : 'y';
  // The axis each series is drawn on, and the writer of each axis: one per axis whose series agree.
  const axisOf = (ds: any): string => (pie ? '' : String((horizontal ? ds?.xAxisID : ds?.yAxisID) ?? valueAxis));
  const writers = new Map<string, NamedWriter | null>();
  if (fields.length === 1 || pie || fields.length !== datasets.length) {
    writers.set('*', namedWriter(fields, datasets.flatMap(valuesOf)));
  } else {
    for (const axis of new Set(datasets.map(axisOf))) {
      const on = datasets.map((ds, i) => [ds, fields[i]] as const).filter(([ds]) => axisOf(ds) === axis);
      writers.set(axis, namedWriter(on.map(([, f]) => f), on.flatMap(([ds]) => valuesOf(ds))));
    }
  }
  const writerOf = (ds: any): NamedWriter | null => (writers.has('*') ? writers.get('*')! : writers.get(axisOf(ds)) ?? null);
  if (![...writers.values()].some(Boolean)) return;
  config.options = options;
  if (!pie) {
    const scales = (options.scales = { ...(options.scales || {}) });
    const axes = writers.has('*') ? [[valueAxis, writers.get('*')] as const] : [...writers.entries()];
    for (const [axis, write] of axes) {
      if (!write) continue;
      const scale = (scales[axis] = { ...(scales[axis] || {}) });
      const ticks = (scale.ticks = { ...(scale.ticks || {}) });
      if (ticks.callback === undefined) ticks.callback = (v: number | string) => (typeof v === 'number' ? write.axis(v) : v);
      if (write.kind === 'share' && scale.min === undefined && scale.suggestedMin === undefined
          && scale.beginAtZero === undefined) scale.beginAtZero = true;
    }
  }
  const name = readableLabelWriter(pie ? config.data?.labels : datasets.map((ds) => ds?.label)) ?? ((v: unknown) => String(v ?? ''));
  const plugins = (options.plugins = { ...(options.plugins || {}) });
  const tooltip = (plugins.tooltip = { ...(plugins.tooltip || {}) });
  const callbacks = (tooltip.callbacks = { ...(tooltip.callbacks || {}) });
  if (callbacks.label === undefined) {
    callbacks.label = (item: any) => {
      const raw = pie ? item?.raw : (item?.parsed && typeof item.parsed === 'object' ? (horizontal ? item.parsed.x : item.parsed.y) : item?.raw);
      const n = numberOf(raw);
      const write = writerOf(item?.dataset);
      const value = n === null ? String(raw ?? '') : (write ? write.tooltip(n) : String(item?.formattedValue ?? n));
      const label = pie ? item?.label : item?.dataset?.label;
      return label ? `${name(label)}: ${value}` : value;
    };
  }
}

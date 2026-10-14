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
 * Every series of the chart has to say the same, or the chart is left as it is.
 *
 * Pure, so `npm test` asks it directly - see chart-name-format.test.ts.
 */

import { chartNumberFormatOf } from './chart-number-format.ts';
import { stackPercentOn } from './stack-percent.ts';

export type NamedKind = 'currency' | 'share' | '';

const MONEY_WORDS = new Set([
  'price', 'amount', 'cost', 'revenue', 'salary', 'fee', 'charge', 'payable', 'payment', 'income',
  'expense', 'balance', 'sales', 'profit', 'earnings', 'discount', 'tax',
]);
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
  return '';
}

/** How a chart's numbers are written by name: on its axis and in its tooltip. */
export interface NamedWriter {
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
    return { axis: (v) => money(Math.abs(v) >= 10 || v === 0 ? 0 : 2)(v), tooltip: money(2) };
  }
  if (kind === 'share') {
    const nums = values.map(numberOf).filter((v): v is number => v !== null);
    const fraction = nums.length > 0 && nums.every((v) => Math.abs(v) <= 1);
    const points = (digits: number) => (v: number) =>
      (fraction ? v * 100 : v).toLocaleString('en-US', { maximumFractionDigits: digits }) + '%';
    return { axis: points(1), tooltip: points(2) };
  }
  return null;
}

const NO_VALUE_AXIS = new Set(['pie', 'doughnut', 'polarArea', 'radar']);
/** A point of these is two numbers or three: a name cannot say which one it is. */
const TUPLE_TYPES = new Set(['scatter', 'bubble', 'boxplot', 'violin']);

/**
 * Write a built chart's numbers by its series' names, in place, when it names no format of its
 * own; a tick or tooltip callback the configuration has is left to it.
 */
export function applyNamedFormat(config: any, fields: string[]): void {
  if (!config || TUPLE_TYPES.has(config.type)) return;
  if (chartNumberFormatOf(config.options) || stackPercentOn(config.options)) return;
  const values = (config.data?.datasets ?? []).flatMap((ds: any) => (Array.isArray(ds?.data) ? ds.data : []));
  const write = namedWriter(fields, values);
  if (!write) return;
  const options = (config.options = { ...(config.options || {}) });
  const horizontal = options.indexAxis === 'y';
  const pie = NO_VALUE_AXIS.has(config.type);
  if (!pie) {
    const axis = horizontal ? 'x' : 'y';
    const scales = (options.scales = { ...(options.scales || {}) });
    const scale = (scales[axis] = { ...(scales[axis] || {}) });
    const ticks = (scale.ticks = { ...(scale.ticks || {}) });
    if (ticks.callback === undefined) ticks.callback = (v: number | string) => (typeof v === 'number' ? write.axis(v) : v);
  }
  const plugins = (options.plugins = { ...(options.plugins || {}) });
  const tooltip = (plugins.tooltip = { ...(plugins.tooltip || {}) });
  const callbacks = (tooltip.callbacks = { ...(tooltip.callbacks || {}) });
  if (callbacks.label === undefined) {
    callbacks.label = (item: any) => {
      const raw = pie ? item?.raw : (item?.parsed && typeof item.parsed === 'object' ? (horizontal ? item.parsed.x : item.parsed.y) : item?.raw);
      const n = numberOf(raw);
      const value = n === null ? String(raw ?? '') : write.tooltip(n);
      const name = pie ? item?.label : item?.dataset?.label;
      return name ? `${name}: ${value}` : value;
    };
  }
}

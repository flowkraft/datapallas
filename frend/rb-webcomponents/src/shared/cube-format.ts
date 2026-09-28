/**
 * How a cube's numbers and dates are written, in one place (design W4.2).
 *
 * A cube declares what a measure is - `format 'currency'`, `'percent'`, `'number'` - and the cube
 * declares which currency once. Every host that shows a cube's answer reads those declarations
 * through this file: the table's columns, the single value, the chart's ticks and tooltips, the
 * drill modal. That is what makes the same measure read the same everywhere, instead of each
 * component guessing from the column's name.
 *
 * A percent is a fraction, as `rb-value` has always taken it: 0.34 is 34%.
 */

/** What a measure's `format` may say. Anything else is shown as it came back. */
export type CubeFormat = 'currency' | 'percent' | 'number' | '';

/** The currency a cube uses when it names none. */
export const DEFAULT_CURRENCY = 'USD';

/** The grains a time dimension can be asked for; `''` is "as is". */
export type CubeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year' | '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The number in a cell, whatever box the driver put it in, or `null` when there is none. */
function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Text a database wrote a number as, with whatever it wrapped it in taken off. Text that holds
  // no digit at all is not a number: stripping it would leave "" and read as zero, so `N/A` would
  // come back as $0.00 - a number nobody computed.
  const text = String(value);
  if (!/[0-9]/.test(text)) return null;
  const num = Number(text.replace(/[^0-9.eE+\-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

/**
 * One measure's value, as its cube declares it.
 *
 * An empty cell stays empty - a missing prior period is not zero - and a value that is not a
 * number at all is shown as it came, because hiding it would be worse than showing it.
 */
export function formatMeasure(value: unknown, format: string,
    currency: string = DEFAULT_CURRENCY): string {
  if (value === null || value === undefined) return '';
  const num = numberOf(value);
  if (num === null) return String(value);

  switch (format) {
    case 'currency':
      return num.toLocaleString('en-US', {
        style: 'currency',
        currency: currency || DEFAULT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case 'percent':
      // A fraction, not a number of percent: 0.34 is 34%, and 0.0811 is 8.11% rather than 8%.
      return (num * 100).toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      }) + '%';
    case 'number':
      return num.toLocaleString('en-US');
    default:
      return String(value);
  }
}

/** The first ten characters of a date, however the driver spelt the rest of it. */
function dayOf(value: unknown): string {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
}

/**
 * A date column's label at the grain it was asked for: `2024`, `Q1 2024`, `Mar 2024`,
 * `Week of Mar 11, 2024`, `Mar 14, 2024`. "As is" is the value the database returned.
 *
 * The date is read as text and never through `new Date`, which would move a day's worth of it
 * into whatever time zone the browser happens to be in.
 */
export function formatTime(value: unknown, granularity: string): string {
  if (value === null || value === undefined || value === '') return '';
  const day = dayOf(value);
  if (!day) return String(value);

  const year = day.slice(0, 4);
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));

  switch (granularity) {
    case 'year': return year;
    case 'quarter': return 'Q' + String(Math.floor((month - 1) / 3) + 1) + ' ' + year;
    case 'month': return MONTHS[month - 1] + ' ' + year;
    case 'week': return 'Week of ' + MONTHS[month - 1] + ' ' + date + ', ' + year;
    case 'day': return MONTHS[month - 1] + ' ' + date + ', ' + year;
    default: return String(value);
  }
}

/** What one column is: a measure with a format, a date at a grain, or anything else. */
export interface CubeColumnFormat {
  /** The measure's declared `format`, or `''`. */
  format?: string;
  /** The grain a time dimension was asked for, or `''`; `undefined` for a column that is not one. */
  granularity?: string;
  /** The cube's currency, for a `currency` format. */
  currency?: string;
}

/**
 * One cell, by what its column is. This is the whole rule the table, the chart and the drill modal
 * share: a column is either a measure with a declared format, a date at a grain, or plain.
 */
export function formatCell(value: unknown, column: CubeColumnFormat | undefined): string {
  if (!column) return value === null || value === undefined ? '' : String(value);
  if (column.granularity !== undefined) return formatTime(value, column.granularity);
  if (column.format) return formatMeasure(value, column.format, column.currency);
  return value === null || value === undefined ? '' : String(value);
}

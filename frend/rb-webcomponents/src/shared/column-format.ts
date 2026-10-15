/**
 * A published table's numbers, written the way the Canvas wrote them when the table was built.
 *
 * The Canvas formats every column it draws: what the author set in the column's gear, and for a
 * column nobody said anything about, what its name and its values make it - money, a share, a
 * plain number. The gear's settings are published with the table (`formatter 'money'`); the
 * picked formats were not, so a column the Canvas showed as $1,326,265.80 read 1326265.8 once
 * published. This picks them the same way, for a table whose columns are made from its data.
 *
 * LOGIC-MIRROR of the number kinds of `pickColumnFormat` and of `formatCurrencyValue`,
 * `formatPercentageValue` and `formatNumberValue` in
 * `ui-startpage/lib/explore-data/type-formatters.ts`, with the name rules of
 * `smart-defaults/classification.ts`. A coordinate or a duration is left as the database wrote
 * it: the Canvas writes those its own way, and nothing here guesses at them. So is a column of
 * whole numbers that is neither money nor a share: an id or a year must not read 123,349 or 2,024.
 * Every number column lines up on the right, as in the Canvas, written out or not; and a column of
 * true / false reads "Yes" / "—", as the Canvas writes a boolean column (`formatBooleanValue`).
 */

export type ColumnNumberKind = 'currency' | 'percentage' | 'number';

export interface ColumnNumberFormat {
  kind: ColumnNumberKind;
  /** ISO-4217 code, for money: from the column's name (`price_eur`), else USD. */
  currency?: string;
}

const CURRENCY_NAME_RX = /\b(price|amount|cost|revenue|total|salary|fee|charge|payable|payment|income|expense|balance|sales|profit|earnings|discount|tax)\b/i;
const PERCENTAGE_NAME_RX = /\b(percent|pct|rate|ratio|share)\b/i;
const PERCENTAGE_SUFFIX_RX = /_(pct|percent|rate|ratio)$/i;
const DURATION_RX = /\b(duration|elapsed|time_taken|seconds|minutes|hours|days|ms|millis)\b/i;
const LATITUDE_KEYWORDS = ['lat', 'latitude'];
const LONGITUDE_KEYWORDS = ['lon', 'lng', 'long', 'longitude'];

const KNOWN_CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'AUD', 'CAD', 'CHF', 'SEK', 'NOK',
  'DKK', 'BRL', 'RUB', 'KRW', 'SGD', 'HKD', 'MXN', 'ZAR', 'TRY', 'PLN', 'THB',
  'NZD', 'TWD', 'ILS', 'AED', 'SAR', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'ISK',
  'IDR', 'PHP', 'MYR', 'VND', 'UAH', 'BTC', 'ETH',
]);
const CURRENCIES_WITH_NATIVE_SYMBOLS = new Set([
  'USD', 'CAD', 'EUR', 'AUD', 'BRL', 'BTC', 'CNY', 'GBP', 'HKD',
  'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'NZD', 'TWD', 'VND',
]);

function currencyFromName(name: string): string | undefined {
  const match = name.match(/[_\-.]?([A-Z]{3})(_\d{4})?$|([A-Z]{3})$/i);
  if (!match) return undefined;
  const code = (match[1] ?? match[3] ?? '').toUpperCase();
  return KNOWN_CURRENCY_CODES.has(code) ? code : undefined;
}

function geoHeadOrTail(name: string, keywords: string[]): boolean {
  const toks = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split(/[_\s]+/)
    .map((s) => s.toLowerCase()).filter(Boolean);
  if (toks.length === 0) return false;
  if (keywords.includes(toks[0]) || keywords.includes(toks[toks.length - 1])) return true;
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.endsWith(kw) || lower.startsWith(kw));
}

/** A boolean, as the Canvas writes one: "Yes", or a dash for no. */
export function formatBooleanValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v === true) return 'Yes';
  if (v === false) return '—';
  return String(v);
}

/** A column's values, in row order. */
function valuesOf(rows: any[], field: string): unknown[] {
  return rows.map((row) => row?.[field]);
}

/**
 * How the Canvas writes a column of this name and these values, or `null` for as they came. The
 * kind is read off the column's first value, as the Canvas reads it; a plain number column is
 * written out only when it holds a fraction somewhere.
 */
export function columnNumberFormat(field: string, values: unknown[]): ColumnNumberFormat | null {
  const sample = values.find((v) => v !== null && v !== undefined);
  if (typeof sample !== 'number') return null;
  if (CURRENCY_NAME_RX.test(field)) return { kind: 'currency', currency: currencyFromName(field) ?? 'USD' };
  if (PERCENTAGE_NAME_RX.test(field) || PERCENTAGE_SUFFIX_RX.test(field)) return { kind: 'percentage' };
  if (geoHeadOrTail(field, LATITUDE_KEYWORDS) || geoHeadOrTail(field, LONGITUDE_KEYWORDS)) return null;
  if (DURATION_RX.test(field)) return null;
  return values.some((v) => typeof v === 'number' && !Number.isInteger(v)) ? { kind: 'number' } : null;
}

/** One value, in its column's format. An empty cell stays empty; text that is no number stays. */
export function formatColumnValue(v: unknown, format: ColumnNumberFormat): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (format.kind === 'currency') {
    const currency = format.currency ?? 'USD';
    const currencyDisplay = CURRENCIES_WITH_NATIVE_SYMBOLS.has(currency) ? 'symbol' : 'code';
    try {
      return n.toLocaleString(undefined, {
        style: 'currency', currency, currencyDisplay, minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
    } catch {
      return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  }
  if (format.kind === 'percentage') {
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return pct.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%';
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/**
 * The column definitions of a table whose columns are made from its data, each number column
 * given the format the Canvas gave it - unless its definition already says how it is written.
 * Definitions come listed or keyed by field, as Tabulator takes them, and go back the same way.
 */
export function withColumnNumberFormats(definitions: unknown, rows: any[]): unknown {
  // Definitions written as a function make their own columns: nothing here second-guesses them.
  if (typeof definitions === 'function') return definitions;
  if (!Array.isArray(rows) || rows.length === 0 || rows[0] == null || typeof rows[0] !== 'object') return definitions;
  const keyed = definitions != null && typeof definitions === 'object' && !Array.isArray(definitions);
  const listed: any[] = Array.isArray(definitions) ? definitions.map((d) => ({ ...d }))
    : keyed ? Object.entries(definitions as Record<string, any>).map(([field, d]) => ({ field, ...d })) : [];
  let changed = false;
  for (const field of Object.keys(rows[0])) {
    const values = valuesOf(rows, field);
    const sample = values.find((v) => v !== null && v !== undefined);
    if (typeof sample !== 'number' && typeof sample !== 'boolean') continue;
    let def = listed.find((d) => d?.field === field);
    if (def?.formatter) continue;
    if (!def) { def = { field }; listed.push(def); }
    if (typeof sample === 'boolean') {
      def.formatter = (cell: { getValue: () => unknown }) => formatBooleanValue(cell.getValue());
    } else {
      const format = columnNumberFormat(field, values);
      if (format) def.formatter = (cell: { getValue: () => unknown }) => formatColumnValue(cell.getValue(), format);
      // A number lines up on the right, as it does in the Canvas, written out or as it came.
      def.hozAlign ??= 'right';
      def.headerHozAlign ??= 'right';
    }
    changed = true;
  }
  if (!changed) return definitions;
  if (!keyed) return listed;
  return Object.fromEntries(listed.map(({ field, ...d }) => [field, d]));
}

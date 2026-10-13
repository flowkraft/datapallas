// Type-aware cell formatters. Given a (value, column) pair, pick the right
// renderer based on the column's semantic predicates. Used by Tabulator
// (per-column formatters), Detail (k/v), Number (headline), and wherever else
// we render a raw row value.
//
// Two entry points:
//   - `formatCellHtml(value, col)`   → HTML string (good for Tabulator's
//                                       `formatter: "html"` mode and for the
//                                       <rb-detail>/<rb-tabulator> web components)
//   - `pickColumnFormat(col)`        → a stable { kind, opts } descriptor the
//                                       web components can match on without
//                                       having to re-import predicates.

import type { ColumnSchema } from "./types";
import type { TimeBucket } from "@/lib/stores/canvas-store";

/** Display-granularity superset of TimeBucket. Adds `hour` and `minute` as
 *  display-only units — not valid GROUP BY buckets (DB dialects differ on
 *  DATE_TRUNC('hour', …) support) but valid for rendering a raw timestamp
 *  column at a coarser display level. */
export type DateUnit = TimeBucket | "hour" | "minute";
import {
  isURL, isEmail, isImageURL, isAvatarURL,
  isState, isCountry,
  isCurrency, isPercentage,
  isLatitude, isLongitude, isCoordinate,
  isDuration, isTemporal, isNumeric, isBooleanCol,
} from "./smart-defaults";

// ─────────────────────────────────────────────────────────────────────────────
// Currency detection.
//
// We have no persisted per-column metadata (yet), so we infer the ISO code
// from the column-name suffix: `price_eur` / `amount_gbp` / `total_jpy` →
// "EUR" / "GBP" / "JPY". Falls back to USD when no code is found.
// ─────────────────────────────────────────────────────────────────────────────

// ISO-4217 codes we auto-detect from column names. Covers the majors + crypto.
const KNOWN_CURRENCY_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AUD", "CAD", "CHF", "SEK", "NOK",
  "DKK", "BRL", "RUB", "KRW", "SGD", "HKD", "MXN", "ZAR", "TRY", "PLN", "THB",
  "NZD", "TWD", "ILS", "AED", "SAR", "CZK", "HUF", "RON", "BGN", "HRK", "ISK",
  "IDR", "PHP", "MYR", "VND", "UAH", "BTC", "ETH",
]);

// Narrow/"local" symbols where the browser's `Intl` output differs from the
// one users in that locale would expect (USD → "$", not "US$"). Currencies
// outside this set render in ISO-code style by default.
const CURRENCIES_WITH_NATIVE_SYMBOLS = new Set([
  "USD", "CAD", "EUR", "AUD", "BRL", "BTC", "CNY", "GBP", "HKD",
  "ILS", "INR", "JPY", "KRW", "MXN", "NZD", "TWD", "VND",
]);

/** Extract the ISO-4217 currency code from a column name's suffix or infix.
 *  Returns `undefined` if no known code is found. */
export function detectCurrencyFromName(columnName: string): string | undefined {
  // `price_eur`, `amountGBP`, `total-jpy`, `revenue_usd_2024` — match _XXX/
  // -XXX/.XXX/CamelXXX suffix or trailing-before-year.
  const match = columnName.match(/[_\-.]?([A-Z]{3})(_\d{4})?$|([A-Z]{3})$/i);
  if (match) {
    const code = (match[1] ?? match[3] ?? "").toUpperCase();
    if (KNOWN_CURRENCY_CODES.has(code)) return code;
  }
  return undefined;
}

/** Whether a currency code should default to symbol-display (vs code-display).
 *  Used by the column-settings dialog to pick the default "style" option. */
export function shouldDefaultToSymbol(currency: string): boolean {
  return CURRENCIES_WITH_NATIVE_SYMBOLS.has(currency);
}

export type FormatKind =
  | "url" | "email" | "image"
  | "state" | "country"
  | "currency" | "percentage"
  | "coordinate" | "duration"
  | "date" | "number" | "boolean" | "text";

export type CurrencyStyle = "symbol" | "code" | "name";

export interface FormatSpec {
  kind: FormatKind;
  /** Hex RGB or CSS color for links/images. */
  tint?: string;
  /** ISO-4217 currency code (e.g., "USD"). Defaults to USD for currency kind. */
  currency?: string;
  /** How to display the currency — "$" / "USD" / "US dollars". Defaults to
   *  "symbol" if the code has a well-known native symbol, else "code". */
  currencyStyle?: CurrencyStyle;
  /** Locale override for Intl.NumberFormat / Intl.DateTimeFormat. When absent,
   *  the browser default locale is used. */
  locale?: string;
  /** Explicit decimal places. When absent, integers get 0 and fractions ≤2. */
  decimals?: number;
  /** Value multiplier applied before format (e.g., 100 for ratio→percent). */
  scale?: number;
  /** Prefix string prepended after format (e.g., "~"). */
  prefix?: string;
  /** Suffix string appended after format. */
  suffix?: string;
  /** Compact notation (1.2K / 3.4M / 1.5B) for numbers/currency. */
  compact?: boolean;
  /** Temporal unit the column was bucketed by. Drives format dispatch:
   *  month→"MMM YYYY", week→start-of-week date, day-of-week→"Monday", etc. */
  dateUnit?: DateUnit;
  /** Explicit date style override. When absent, we use the default for the
   *  bucket (or ISO-short for raw dates). */
  dateStyle?: "short" | "medium" | "long" | "iso";
  /** The unit a duration column's numbers are in, read off its name. */
  durationUnit?: DurationUnit;
}

/** The units a duration column can be counted in. */
export type DurationUnit = "ms" | "s" | "min" | "h" | "d";

const DURATION_UNITS: Array<[RegExp, DurationUnit]> = [
  [/\b(ms|millis|milliseconds)\b/i, "ms"],
  [/\b(seconds|secs?)\b/i, "s"],
  [/\b(minutes|mins?)\b/i, "min"],
  [/\b(hours|hrs?)\b/i, "h"],
  [/\b(days)\b/i, "d"],
];

/** The unit a duration column names (`days`, `Delivery hours`, `ms`), or undefined when its
 *  name says none (`duration`, `elapsed`): a number of an unknown unit is not guessed at. */
export function durationUnitFromName(columnName: string): DurationUnit | undefined {
  return DURATION_UNITS.find(([rx]) => rx.test(columnName))?.[1];
}

/** Pure classifier — given a column schema, decide the formatter. Ordered so
 *  the most specific semantic wins (URL before generic text; Currency before
 *  generic number). For currency columns, auto-infers the ISO code from the
 *  column-name suffix (falls back to USD). */
export function pickColumnFormat(col: ColumnSchema): FormatSpec {
  if (isImageURL(col) || isAvatarURL(col)) return { kind: "image" };
  if (isURL(col))          return { kind: "url" };
  if (isEmail(col))        return { kind: "email" };
  if (isState(col))        return { kind: "state" };
  if (isCountry(col))      return { kind: "country" };
  if (isCurrency(col)) {
    const detected = detectCurrencyFromName(col.columnName);
    const currency = detected ?? "USD";
    return {
      kind: "currency",
      currency,
      currencyStyle: shouldDefaultToSymbol(currency) ? "symbol" : "code",
    };
  }
  if (isPercentage(col))   return { kind: "percentage" };
  if (isLatitude(col) || isLongitude(col) || isCoordinate(col))
                           return { kind: "coordinate" };
  if (isDuration(col)) {
    // A duration is written in the unit its name gives; one with no unit stays a number.
    const durationUnit = durationUnitFromName(col.columnName);
    return durationUnit ? { kind: "duration", durationUnit } : { kind: "number" };
  }
  if (isTemporal(col))     return { kind: "date" };
  if (isBooleanCol(col))   return { kind: "boolean" };
  if (isNumeric(col))      return { kind: "number" };
  return { kind: "text" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level formatters — pure functions. Return a plain string for `number`,
// `currency`, `percentage`, `coordinate`, `duration`, `date`, `boolean`; return
// an HTML string for `url`, `email`, `image`.
// ─────────────────────────────────────────────────────────────────────────────

/** Apply `scale`, `prefix`, `suffix` around a core formatted string. Used by
 *  number/currency/percentage formatters to respect user column-settings. */
function wrap(core: string, spec: FormatSpec): string {
  const prefix = spec.prefix ?? "";
  const suffix = spec.suffix ?? "";
  return prefix + core + suffix;
}

export function formatNumberValue(v: unknown, spec: FormatSpec = { kind: "number" }): string {
  if (v === null || v === undefined || v === "") return "";
  let n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (typeof spec.scale === "number" && Number.isFinite(spec.scale)) n *= spec.scale;

  if (spec.compact) {
    // Intl compact notation — "1.2K", "3.4M", "1.5B".
    return wrap(n.toLocaleString(spec.locale, {
      notation: "compact",
      maximumFractionDigits: spec.decimals ?? 1,
    }), spec);
  }

  const isInt = Number.isInteger(n);
  return wrap(n.toLocaleString(spec.locale, {
    minimumFractionDigits: spec.decimals ?? 0,
    maximumFractionDigits: spec.decimals ?? (isInt ? 0 : 2),
  }), spec);
}

export function formatCurrencyValue(v: unknown, spec: FormatSpec = { kind: "currency" }): string {
  if (v === null || v === undefined || v === "") return "";
  let n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (typeof spec.scale === "number" && Number.isFinite(spec.scale)) n *= spec.scale;

  const currency = spec.currency ?? "USD";
  const style = spec.currencyStyle ?? (shouldDefaultToSymbol(currency) ? "symbol" : "code");
  // Intl currencyDisplay: "symbol" / "narrowSymbol" / "code" / "name".
  const currencyDisplay: "symbol" | "code" | "name" = style;

  if (spec.compact) {
    // For compact currency, format the number compactly then prepend the
    // symbol/code manually — Intl's compact notation ignores currency.
    const compactNum = n.toLocaleString(spec.locale, {
      notation: "compact",
      maximumFractionDigits: spec.decimals ?? 1,
    });
    const symbol = (0).toLocaleString(spec.locale, { style: "currency", currency, currencyDisplay })
      .replace(/[\d.,\s]/g, "");
    return wrap(style === "symbol" ? symbol + compactNum : `${compactNum} ${currency}`, spec);
  }

  try {
    return wrap(n.toLocaleString(spec.locale, {
      style: "currency",
      currency,
      currencyDisplay,
      minimumFractionDigits: spec.decimals ?? 2,
      maximumFractionDigits: spec.decimals ?? 2,
    }), spec);
  } catch {
    // Unknown currency code — fall back to code + raw number.
    return wrap(`${currency} ${n.toLocaleString(spec.locale, { maximumFractionDigits: 2 })}`, spec);
  }
}

/** Percentage formatter — treats values in [-1, 1] as ratios (×100), values
 *  outside as already-percent. Handles both conventions users commonly store.
 *  Honors `decimals`, `scale`, `prefix`, `suffix`, `compact`. */
export function formatPercentageValue(v: unknown, spec: FormatSpec = { kind: "percentage" }): string {
  if (v === null || v === undefined || v === "") return "";
  let n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (typeof spec.scale === "number" && Number.isFinite(spec.scale)) n *= spec.scale;

  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return wrap(pct.toLocaleString(spec.locale, {
    minimumFractionDigits: spec.decimals ?? 0,
    maximumFractionDigits: spec.decimals ?? 1,
  }) + "%", spec);
}

export function formatCoordinateValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(5) + "°";
}

const SECONDS_IN: Record<DurationUnit, number> = { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 };
const UNIT_SHORT: Record<DurationUnit, string> = { ms: " ms", s: "s", min: "m", h: "h", d: "d" };

/** Duration formatter — a number in the unit its column names (`spec.durationUnit`), written
 *  as its two largest parts: "5d", "2d 12h", "1h 30m", "45s", "250 ms". A duration whose unit is
 *  not known is written as a plain number: 5 days must not read "5s". */
export function formatDurationValue(v: unknown, spec: FormatSpec = { kind: "duration" }): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (!spec.durationUnit) return formatNumberValue(n, { kind: "number" });
  const sign = n < 0 ? "-" : "";
  const total = Math.abs(n) * SECONDS_IN[spec.durationUnit];
  // Nothing at all reads in the column's own unit: no time is "0d" in a column of days.
  if (total === 0) return `0${UNIT_SHORT[spec.durationUnit]}`;
  // Each step compares what it would write: 999.6 ms is 1s, and 59.97s is 1m.
  const millis = Math.round(total * 1000);
  if (millis < 1000) return `${sign}${millis} ms`;
  const tenths = Math.round(total * 10) / 10;
  if (tenths < 60) return `${sign}${tenths}s`;
  const steps: Array<[number, string]> = [[86400, "d"], [3600, "h"], [60, "m"], [1, "s"]];
  const largest = (seconds: number) => steps.findIndex(([size]) => seconds >= size);
  // Rounded to the smaller of its two parts, then its parts picked again: 59m 59.8s is 1h.
  const unit = steps[largest(tenths) + 1][0];
  const rounded = Math.round(tenths / unit) * unit;
  const big = largest(rounded);
  const [bigSize, bigName] = steps[big];
  const [smallSize, smallName] = steps[big + 1];
  const smalls = Math.round(rounded / smallSize);
  const perBig = bigSize / smallSize;
  const whole = Math.floor(smalls / perBig);
  const rest = smalls % perBig;
  return `${sign}${whole}${bigName}${rest ? ` ${rest}${smallName}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting — unit-aware dispatch.
//
// When a temporal column is bucketed by the query (GROUP BY
// DATE_TRUNC('month', …) or EXTRACT(DOW FROM …)), the display format should
// match the bucket rather than rendering every row as a full date with day.
// Built on Intl.DateTimeFormat — zero-dep, locale-aware.
//
// Truncation buckets (day/week/month/quarter/year) produce continuous values
// — we format the instant using locale-aware options. Extraction buckets
// (day-of-week / hour-of-day / month-of-year / quarter-of-year) produce
// discrete integers or enum-like values — we format those as the label the
// user expects ("Monday", "14:00", "March", "Q3").
// ─────────────────────────────────────────────────────────────────────────────

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Format a number-or-date value according to an optional bucket unit. When
 *  `unit` is absent, uses the sensible default (medium date). */
export function formatDateWithUnit(v: unknown, unit?: DateUnit, locale?: string): string {
  if (v === null || v === undefined || v === "") return "";

  // Extraction buckets produce small integers (0-6 for DOW, 0-23 for hour,
  // 1-12 for month, 1-4 for quarter) or text labels. Handle before trying
  // to parse as a Date to avoid bogus 1970-based dates.
  if (unit === "day-of-week") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6) return DOW_NAMES[n];
    // Some dialects (PG's ISODOW, Oracle) emit 1-7; accept that too.
    if (Number.isInteger(n) && n >= 1 && n <= 7) return DOW_NAMES[n % 7];
    return String(v);
  }
  if (unit === "hour-of-day") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 23) {
      return `${String(n).padStart(2, "0")}:00`;
    }
    return String(v);
  }
  if (unit === "month-of-year") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 12) return MONTH_NAMES[n - 1];
    return String(v);
  }
  if (unit === "quarter-of-year") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 4) return `Q${n}`;
    return String(v);
  }

  // Truncation buckets (and raw dates) — parse as Date + Intl.DateTimeFormat.
  const d = v instanceof Date ? v : new Date(String(v));
  if (!Number.isFinite(d.getTime())) return String(v);

  switch (unit) {
    case "year":    return d.toLocaleDateString(locale, { year: "numeric" });
    case "quarter": {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q} ${d.getFullYear()}`;
    }
    case "month":   return d.toLocaleDateString(locale, { year: "numeric", month: "short" });
    case "week":    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    case "day":     return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    case "hour":    return d.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    case "minute":  return d.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    default:        return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  }
}

export function formatDateValue(v: unknown, spec: FormatSpec = { kind: "date" }): string {
  return formatDateWithUnit(v, spec.dateUnit, spec.locale);
}

export function formatBooleanValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v === true || v === 1 || v === "1") return "Yes";
  if (v === false || v === 0 || v === "0") return "—";
  const s = String(v).toLowerCase();
  if (s === "true" || s === "y" || s === "yes") return "Yes";
  if (s === "false" || s === "n" || s === "no") return "—";
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML formatters for hyperlink-ish types. Minimal escaping — consumers must
// trust the column classification (already name-regex + fingerprint driven).
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function formatUrlHtml(v: unknown): string {
  const url = v == null ? "" : String(v);
  if (!url) return "";
  const safe = escapeHtml(url);
  const label = url.length > 50 ? escapeHtml(url.slice(0, 47) + "…") : safe;
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:#2171b5;text-decoration:underline">${label}</a>`;
}

export function formatEmailHtml(v: unknown): string {
  const addr = v == null ? "" : String(v);
  if (!addr) return "";
  const safe = escapeHtml(addr);
  return `<a href="mailto:${safe}" style="color:#2171b5;text-decoration:underline">${safe}</a>`;
}

export function formatImageHtml(v: unknown, maxHeight = 40): string {
  const url = v == null ? "" : String(v);
  if (!url) return "";
  const safe = escapeHtml(url);
  return `<img src="${safe}" alt="" style="max-height:${maxHeight}px;max-width:100%;vertical-align:middle;object-fit:contain" loading="lazy" />`;
}

/** Convert a 2-letter ISO-3166 alpha-2 country code to its emoji flag.
 *  Returns null when the input isn't two A–Z letters. */
function countryCodeToFlag(cc: string): string | null {
  if (cc.length !== 2) return null;
  const upper = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const A = 0x41;
  const REGIONAL_A = 0x1F1E6;
  return String.fromCodePoint(
    REGIONAL_A + (upper.charCodeAt(0) - A),
    REGIONAL_A + (upper.charCodeAt(1) - A),
  );
}

/** Country cells: ISO-2 code → 🇺🇸 flag + code badge; full names → plain text. */
export function formatCountryHtml(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "";
  const flag = countryCodeToFlag(s);
  if (flag) {
    return `<span class="rb-fmt-country" title="${escapeHtml(s)}"><span style="margin-right:4px">${flag}</span>${escapeHtml(s.toUpperCase())}</span>`;
  }
  return escapeHtml(s);
}

/** State cells: 2-letter codes rendered as a monospaced tag; full names plain. */
export function formatStateHtml(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "";
  if (/^[A-Za-z]{2}$/.test(s)) {
    return `<span class="rb-fmt-state" style="padding:1px 6px;border:1px solid #ccc;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;">${escapeHtml(s.toUpperCase())}</span>`;
  }
  return escapeHtml(s);
}

/** Text-only country — flag prefix when we can, plain string otherwise. */
export function formatCountryText(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "";
  const flag = countryCodeToFlag(s);
  return flag ? `${flag} ${s.toUpperCase()}` : s;
}

/** Text-only state — upper-case codes, pass-through for full names. */
export function formatStateText(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "";
  return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level dispatch. Returns an HTML string — safe to use as innerHTML
// inside Tabulator's `formatter: "html"`, inside <rb-detail>, etc.
// Plain strings are escaped; URL/email/image return already-escaped HTML.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render one cell value to an HTML string given its column. Entry point used
 * by the React-side widgets (TabulatorWidget, DetailWidget).
 *
 * Deliberately parallel to `formatByKind()` in
 * `frend/rb-webcomponents/src/wc/RbDetail.wc.svelte` — the Svelte copy lets
 * standalone HTML exports render cells without pulling a TS runtime. Keep
 * the two in sync when editing either side (currency style, decimals,
 * date-unit handling, null handling, HTML escaping).
 */
export function formatCellHtml(v: unknown, col: ColumnSchema, spec?: FormatSpec): string {
  const fmt = spec ?? pickColumnFormat(col);
  if (v === null || v === undefined) return "";
  switch (fmt.kind) {
    case "url":        return formatUrlHtml(v);
    case "email":      return formatEmailHtml(v);
    case "image":      return formatImageHtml(v);
    case "state":      return formatStateHtml(v);
    case "country":    return formatCountryHtml(v);
    case "currency":   return escapeHtml(formatCurrencyValue(v, fmt));
    case "percentage": return escapeHtml(formatPercentageValue(v, fmt));
    case "coordinate": return escapeHtml(formatCoordinateValue(v));
    case "duration":   return escapeHtml(formatDurationValue(v, fmt));
    case "date":       return escapeHtml(formatDateValue(v, fmt));
    case "boolean":    return escapeHtml(formatBooleanValue(v));
    case "number":     return escapeHtml(formatNumberValue(v, fmt));
    default:           return escapeHtml(String(v));
  }
}

/** Text-only variant — for contexts that can't render HTML (Number headline,
 *  chart tooltips, chart axis labels). Skips URL/email/image and returns the
 *  raw string. */
export function formatCellText(v: unknown, col: ColumnSchema, spec?: FormatSpec): string {
  const fmt = spec ?? pickColumnFormat(col);
  if (v === null || v === undefined) return "";
  switch (fmt.kind) {
    case "state":      return formatStateText(v);
    case "country":    return formatCountryText(v);
    case "currency":   return formatCurrencyValue(v, fmt);
    case "percentage": return formatPercentageValue(v, fmt);
    case "coordinate": return formatCoordinateValue(v);
    case "duration":   return formatDurationValue(v, fmt);
    case "date":       return formatDateValue(v, fmt);
    case "boolean":    return formatBooleanValue(v);
    case "number":     return formatNumberValue(v, fmt);
    default:           return String(v);
  }
}

/** Build a per-column format map — one call per query result. Consumed by
 *  widget wrappers to pass a stable map down to the web components. */
export function buildColumnFormats(cols: ColumnSchema[]): Record<string, FormatSpec> {
  const out: Record<string, FormatSpec> = {};
  for (const col of cols) out[col.columnName] = pickColumnFormat(col);
  return out;
}

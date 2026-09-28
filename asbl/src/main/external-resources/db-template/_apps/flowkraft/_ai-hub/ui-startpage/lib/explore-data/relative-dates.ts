// Relative dates: "in the last 30 days", "this month", "year to date".
//
// This file writes no SQL and reads no clock of its own. It turns one of the
// relative date operators the Filter step offers (`filter-operators.ts`) into
// the pair of plain `yyyy-mm-dd` days that bound it, and the generator
// (`sql-builder.ts`) then writes that pair as the same half-open range a
// `between` on a date column writes: `c >= from AND c < to`.
//
// Why the arithmetic is here and not in the SQL:
//
//   - `CURRENT_DATE` and the interval syntax that goes with it are not one
//     text on nine vendors: `CURRENT_DATE - INTERVAL '3' MONTH` is rejected by
//     SQL Server, `DATEADD` by everything else, and SQLite wants
//     `date('now','-3 months')`. Computing the two days here keeps the
//     generated SQL ANSI and identical on every vendor - only the date
//     literals come from the vendor layer.
//   - a range computed here is also a range a test can pin: `today` is an
//     argument, never `new Date()` read inside the rule, so the tests and the
//     committed case SQL can hold today = 2026-09-30 (the demo seed's `today`)
//     and stay true tomorrow.
//
// "Today" is the day on the machine the canvas is open on - the browser's own
// date, in the browser's own time zone, taken when the SQL is built. A user in
// Auckland and a user in Los Angeles can therefore be a day apart on the same
// canvas, which is what they each mean by "today".

/** A half-open span of whole days: `from` is included, `to` is not. */
export interface DayRange {
  from: string;
  to: string;
}

/** The three operators that take a number: how many days, weeks or months. */
export const RELATIVE_DATE_N_OPS = ["last_n_days", "last_n_weeks", "last_n_months"];

/** The relative periods that take no value at all - today's date is enough. */
export const RELATIVE_DATE_PERIOD_OPS = [
  "this_month", "previous_month", "this_quarter", "this_year", "year_to_date",
];

/** Every relative date operator, in the order the dropdown offers them. */
export const RELATIVE_DATE_OPS = [...RELATIVE_DATE_N_OPS, ...RELATIVE_DATE_PERIOD_OPS];

/** True when this operator reads today's date instead of a typed date. */
export function isRelativeDateOp(operator: string): boolean {
  return RELATIVE_DATE_OPS.includes(operator);
}

/** Today, as the plain `yyyy-mm-dd` of the machine this runs on. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A day as its three numbers, or null for anything not a plain `yyyy-mm-dd`. */
function parseDay(day: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((day ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null; // 2026-02-30 and friends
  }
  return { y, m: mo, d };
}

function iso(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The number of days in a month, so a shift can be clamped to a real day. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(day: { y: number; m: number; d: number }, days: number): string {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/**
 * The same day of the month, `months` later or earlier, clamped to the last day
 * of the month it lands in: one month before 31 March is 28 February, because
 * 31 February is not a day.
 */
function addMonths(day: { y: number; m: number; d: number }, months: number): { y: number; m: number; d: number } {
  const total = day.y * 12 + (day.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return { y, m, d: Math.min(day.d, daysInMonth(y, m)) };
}

/** A positive whole number of periods, or null: `3.5 weeks` is not a period. */
function periodCount(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

/**
 * The two days a relative date operator means, with `today` given.
 *
 * The "last N" operators end today - today included, which is what a user
 * reading "the last 7 days" on a dashboard this afternoon means - so they span
 * exactly N periods back from today: the last 7 days of 2026-09-30 are
 * 2026-09-24 through 2026-09-30, and its last 3 months are 2026-07-01 through
 * 2026-09-30. The fixed periods are the calendar's own: this month, the month
 * before it, this quarter, this year, and this year up to and including today.
 *
 * Returns null when the operator is not a relative one, when `today` is not a
 * plain `yyyy-mm-dd`, and when a "last N" operator has no positive whole number
 * in its value box - a half-typed N asks nothing, like every other half-typed
 * filter value (`valueBoxIsEmpty`).
 */
export function relativeDayRange(
  operator: string,
  value: string | null | undefined,
  today: string,
): DayRange | null {
  const t = parseDay(today);
  if (!t) return null;
  const tomorrow = addDays(t, 1);
  switch (operator) {
    case "last_n_days": {
      const n = periodCount(value);
      return n === null ? null : { from: addDays(t, -(n - 1)), to: tomorrow };
    }
    case "last_n_weeks": {
      const n = periodCount(value);
      return n === null ? null : { from: addDays(t, -(n * 7 - 1)), to: tomorrow };
    }
    case "last_n_months": {
      const n = periodCount(value);
      return n === null ? null : { from: addDays(addMonths(t, -n), 1), to: tomorrow };
    }
    case "this_month": {
      const next = addMonths({ ...t, d: 1 }, 1);
      return { from: iso(t.y, t.m, 1), to: iso(next.y, next.m, 1) };
    }
    case "previous_month": {
      const prev = addMonths({ ...t, d: 1 }, -1);
      return { from: iso(prev.y, prev.m, 1), to: iso(t.y, t.m, 1) };
    }
    case "this_quarter": {
      const first = t.m - ((t.m - 1) % 3);
      const next = addMonths({ y: t.y, m: first, d: 1 }, 3);
      return { from: iso(t.y, first, 1), to: iso(next.y, next.m, 1) };
    }
    case "this_year":
      return { from: iso(t.y, 1, 1), to: iso(t.y + 1, 1, 1) };
    case "year_to_date":
      return { from: iso(t.y, 1, 1), to: tomorrow };
    default:
      return null;
  }
}

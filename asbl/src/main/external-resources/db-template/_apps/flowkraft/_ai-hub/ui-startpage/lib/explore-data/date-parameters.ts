// A dashboard Date parameter, read as the whole day it names.
//
// This file writes no SQL and computes no date. It holds one rule: the name of
// the derived parameter that means "the day after the day this parameter names",
// and which parameters may have one.
//
// Why a derived parameter at all. A dashboard's date range is two Date
// parameters, `from` and `to`, and a range of whole days ends at midnight after
// `to` - the same half-open range every other date filter writes (T5). The day
// after `to` is a date, and a date is computed in one place: not in SQL (`to +
// INTERVAL '1' DAY` is a different text on nearly every vendor), and not in the
// browser (the value arrives later, from the dashboard's filter bar, long after
// this SQL was built). So the SQL names a second parameter, `${to__next_day}`,
// and the backend derives its value where it binds the first one -
// `DateParameters.nextDay` in `com.sourcekraft.documentburster.common
// .reportparameters`, the one conversion both the canvas (`QueriesService`) and
// the published dashboard (`ScriptAssembler`) go through.
//
// Only a parameter the dashboard declared as a Date gets one: a DateTime names
// an instant, and the day after an instant is not what a user asking for
// "on or before 14:05" means.

/** The suffix of the derived parameter. The backend knows the same one. */
export const NEXT_DAY_SUFFIX = "__next_day";

/** The declared types that mean a whole day. `ParameterTypes.typed` reads the
 *  same three words (`Date`, `LocalDate`, `datepicker`) as a `LocalDate`. */
const DAY_TYPES = new Set(["date", "localdate", "datepicker"]);

/** The parameter this value names (`${to}` → `to`), or null when it names none. */
export function paramNameOf(value: string | undefined): string | null {
  const match = /^\$\{(\w+)\}$/.exec((value ?? "").trim());
  return match ? match[1] : null;
}

/** True when this value is bound to a parameter the dashboard declared as a Date. */
export function isDayParam(
  value: string | undefined,
  paramTypes: Record<string, string> | undefined,
): boolean {
  const name = paramNameOf(value);
  if (!name || !paramTypes) return false;
  const declared = paramTypes[name];
  return typeof declared === "string" && DAY_TYPES.has(declared.trim().toLowerCase());
}

/** The placeholder of the day after the day this one names (`${to}` →
 *  `${to__next_day}`). The value itself is the backend's to compute. */
export function nextDayRef(value: string): string {
  const name = paramNameOf(value);
  return name ? `\${${name}${NEXT_DAY_SUFFIX}}` : value;
}

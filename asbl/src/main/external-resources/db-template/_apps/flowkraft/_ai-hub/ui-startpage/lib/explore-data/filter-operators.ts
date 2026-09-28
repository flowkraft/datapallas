// The operators the Filter step offers, in one place.
//
// This file writes no SQL. It holds the list of operators the UI offers for
// each kind of column, and the two small rules that go with them: which
// operators take no value at all, and which can be bound to a dashboard
// parameter. The SQL for every one of them is written by `sql-builder.ts`
// (ANSI) through the vendor layer `sql-dialects.ts`.
//
// It lives here, next to the generator, and no longer inside `FilterStep.tsx`,
// because a test has to be able to walk every operator the UI offers and check
// that the generator really writes SQL for it. An operator added to a list
// without a case in the generator used to fall through to the generator's
// `default:` branch and silently become an equality test.

import { RELATIVE_DATE_N_OPS, RELATIVE_DATE_PERIOD_OPS } from "./relative-dates";

/** One entry of an operator dropdown: the value stored in the filter, and the
 *  label the user reads. */
export interface OperatorDef {
  value: string;
  label: string;
}

export const STRING_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

export const NUMBER_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "greater_than", label: ">" },
  { value: "greater_or_equal", label: ">=" },
  { value: "less_than", label: "<" },
  { value: "less_or_equal", label: "<=" },
  { value: "between", label: "between" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

export const DATE_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "greater_than", label: "after" },
  { value: "greater_or_equal", label: "on or after" },
  { value: "less_than", label: "before" },
  { value: "less_or_equal", label: "on or before" },
  { value: "between", label: "between" },
  // The relative dates. Their two bounds are computed from today's date
  // (`relative-dates.ts`) and written as the same half-open range `between`
  // writes, so a KPI that reads "this month" keeps meaning this month without
  // anyone editing the canvas. The three "last N" operators take the N in the
  // value box; the five periods take no value at all.
  { value: "last_n_days", label: "in the last N days" },
  { value: "last_n_weeks", label: "in the last N weeks" },
  { value: "last_n_months", label: "in the last N months" },
  { value: "this_month", label: "this month" },
  { value: "previous_month", label: "previous month" },
  { value: "this_quarter", label: "this quarter" },
  { value: "this_year", label: "this year" },
  { value: "year_to_date", label: "year to date" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

export const BOOLEAN_OPS: OperatorDef[] = [
  { value: "equals", label: "=" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

/** Every list the Filter step can show, so a test can walk all of them. */
export const ALL_OPERATOR_LISTS: ReadonlyArray<readonly OperatorDef[]> = [
  STRING_OPS, NUMBER_OPS, DATE_OPS, BOOLEAN_OPS,
];

/**
 * The operators that take no value, so the Filter step shows no value box.
 *
 * Two kinds: the NULL checks, which compare with NULL itself, and the fixed
 * relative periods ("this month", "year to date"), whose bounds come from
 * today's date. Both mean something with an empty value box, which is why they
 * are exempt from `valueBoxIsEmpty` below - the "last N" operators are not,
 * because their N is typed there.
 */
export const NO_VALUE_OPS = ["is_null", "is_not_null", ...RELATIVE_DATE_PERIOD_OPS];

/** How a query reads the filters it carries (F3): every one of them, or any one
 *  of them. `all` is what every canvas saved until now means. */
export type FilterMatch = "all" | "any";

/** One entry of the match dropdown: the value stored in the query, and the word
 *  the user reads. */
export const FILTER_MATCHES: { value: FilterMatch; label: string }[] = [
  { value: "all", label: "all" },
  { value: "any", label: "any" },
];

/**
 * True when the query keeps a row that passes ANY of its filters.
 *
 * "Closed Won, or anything above 50000" is one question, and with AND between
 * the conditions it answers almost nothing. The generator joins the conditions
 * with OR inside one pair of brackets, so the whole set is one condition and a
 * later clause cannot bind tighter than intended.
 *
 * Absent - every canvas saved before this existed - means `all`, which is the
 * SQL those canvases already generate.
 */
export function matchesAnyFilter(match?: FilterMatch | null): boolean {
  return match === "any";
}

/** Re-exported so the Filter step reads its operator rules from one file. */
export { RELATIVE_DATE_N_OPS, RELATIVE_DATE_PERIOD_OPS };

// Operators where a ${paramName} placeholder makes sense in SQL.
// The LIKE family is excluded: the pattern needs the % wrapper around the value,
// which a bound parameter cannot carry. `in` / `not_in` are bindable: the param
// value (CSV string like "1, 5, 10") is split into a real SQL list at the JDBI
// layer via bindList - see DatabaseHelper.convertToJdbiParameters /
// QueriesService. `between` is bindable per box: a dashboard's date range is two
// Date parameters, from and to, and each box binds to one of them (F8) - which is
// why the Filter step renders a bind control beside both.
export const PARAM_BINDABLE_OPS = new Set([
  "equals", "not_equals",
  "greater_than", "greater_or_equal",
  "less_than", "less_or_equal",
  "in", "not_in",
  "between",
]);

/** True when this operator compares against a value the user types. */
export function operatorTakesValue(operator: string): boolean {
  return !NO_VALUE_OPS.includes(operator);
}

/**
 * An empty value box means the filter is not applied (the owner, 2026-09-27).
 *
 * The user is still typing: a filter with nothing in its value box asks
 * nothing, so the query comes back with every row, which is what every BI tool
 * does and what `in` / `not in` have always done here. Applying it instead
 * makes `= ''` filter to the rows whose text is empty, and `> ''` on a number
 * is rejected outright by PostgreSQL and SQL Server.
 *
 * `between` needs both bounds: one of them missing is the same half-typed
 * state.
 */
export function valueBoxIsEmpty(
  filter: { operator: string; value?: string | null; valueTo?: string | null },
): boolean {
  if (!operatorTakesValue(filter.operator)) return false;
  if (String(filter.value ?? "").trim() === "") return true;
  if (filter.operator === "between") return String(filter.valueTo ?? "").trim() === "";
  return false;
}

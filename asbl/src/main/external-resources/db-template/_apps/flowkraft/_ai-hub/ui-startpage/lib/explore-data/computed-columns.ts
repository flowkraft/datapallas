// The computed columns the Compute step offers, in one place.
//
// This file writes no SQL. It holds what the Compute step can build - a named
// column that is one arithmetic step over two operands, each of them a numeric
// column of the table or a number the user typed - and the rules that say when
// such a column is finished enough to go into a query. The SQL for it is written
// by `sql-builder.ts` (`computedExpr`, ANSI); division is the one operator
// whose form is not the same text on every vendor, and it comes from the vendor
// layer (`decimalDivision` in `sql-dialects.ts`).
//
// It lives here, next to the generator, and not inside `ComputeStep.tsx`, for
// the same reason as `aggregations.ts` and `filter-operators.ts`: a test has to
// be able to walk every operator the UI offers and check that the generator
// really writes SQL for it. An operator offered without a case in the generator
// would fall through and become SQL no database runs.
//
// Deliberately narrow: there is no free-text expression and therefore no parser.
// An operand is a number or a column name, nothing else, so nothing the user
// types can reach the SQL as SQL - a name goes in quoted as an identifier, a
// number goes in as a number, and anything else makes the column incomplete and
// it is left out of the query entirely. `CASE`, string and date functions stay
// what they have always been: the SQL mode's business (T10).

import type { ColumnSchema } from "./types";

/** One computed column, as a widget stores it: the name it is known by in
 *  Filter, Summarize and Sort, and the one arithmetic step behind it. Each
 *  operand is either a column name or a number, as text. */
export interface ComputedColumn {
  name: string;
  left: string;
  operator: string;
  right: string;
}

/** One entry of the operator dropdown: the operator stored in the widget - which
 *  is the ANSI SQL operator itself - and the sign the user reads. */
export interface ArithmeticOpDef {
  value: string;
  label: string;
}

/**
 * The four arithmetic steps.
 *
 * The stored value IS the ANSI operator, so the generator has nothing to
 * translate; the label is the sign people expect to see, which for two of them
 * is not the ASCII character SQL uses (`×` and `÷` rather than `*` and `/`).
 */
export const ARITHMETIC_OPS: ArithmeticOpDef[] = [
  { value: "+", label: "+" },
  { value: "-", label: "−" },
  { value: "*", label: "×" },
  { value: "/", label: "÷" },
];

/** The operators the dropdown offers, as the widget stores them. */
export const ARITHMETIC_OP_VALUES = ARITHMETIC_OPS.map((o) => o.value);

/** The type name a computed column is described with, so everything that reads
 *  a column's type - the filter operator list, the input control, the
 *  measure/dimension split - treats it as the number it is. */
export const COMPUTED_COLUMN_TYPE_NAME = "DECIMAL";

/** True when this operand is a number the user typed rather than a column name.
 *  Only a plain finite number counts: `1e400`, `0x10` and an empty box are not
 *  numbers, and they are not column names either. */
export function isNumberOperand(operand: string): boolean {
  const text = String(operand ?? "").trim();
  if (text === "" || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return false;
  return Number.isFinite(Number(text));
}

/** True when a computed column is finished: it has a name, an operator the
 *  generator writes SQL for, and both operands filled in. An unfinished one is
 *  left out of the query, the way a filter with an empty value box is. */
export function isCompleteComputedColumn(computed: ComputedColumn | null | undefined): boolean {
  if (!computed) return false;
  const name = String(computed.name ?? "").trim();
  const left = String(computed.left ?? "").trim();
  const right = String(computed.right ?? "").trim();
  return name !== "" && left !== "" && right !== "" && ARITHMETIC_OP_VALUES.includes(computed.operator);
}

/**
 * The computed columns of a query that are really part of it: the finished ones,
 * at most one per name (a second column of the same name would make the SELECT
 * ambiguous, and the name is how Filter, Summarize and Sort ask for it).
 */
export function computedColumnsOf(
  computed: ComputedColumn[] | null | undefined,
): ComputedColumn[] {
  const out: ComputedColumn[] = [];
  const seen = new Set<string>();
  for (const one of computed ?? []) {
    if (!isCompleteComputedColumn(one)) continue;
    const name = one.name.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, left: one.left.trim(), operator: one.operator, right: one.right.trim() });
  }
  return out;
}

/**
 * The computed columns described the way the table's own columns are, so the
 * steps that pick a column can offer them side by side with the real ones. A
 * computed column is a number, and it is nullable: dividing by zero gives NULL
 * (`NULLIF`), and so does any operand that is NULL.
 */
export function computedColumnSchemas(
  computed: ComputedColumn[] | null | undefined,
): ColumnSchema[] {
  return computedColumnsOf(computed).map((one) => ({
    columnName: one.name,
    typeName: COMPUTED_COLUMN_TYPE_NAME,
    isNullable: true,
  }));
}

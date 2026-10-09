// Auto-pick helpers — pick a sensible Summarize, measure, pivot layout, filter
// pane field, or cube render mode from a raw table + cardinality hints.

import type { ColumnSchema, TableSchema } from "../types";
import type { VisualQuery, WidgetType } from "@/lib/stores/canvas-store";
import {
  classifyColumn,
  isIdColumn,
  normalizeType,
  BOOLEAN_TYPES,
  NUMERIC_TYPES,
  TEMPORAL_TYPES,
  TEXT_FREE_TYPES,
  CATEGORY_LOW_MAX,
  type CardinalityMap,
} from "./classification";
import { probeCardinality, probeDateRange } from "./probes";
import { guessTimeBucket } from "./buckets";

/**
 * Pick a sensible Summarize for a raw table.
 *
 * Signature is async because it probes cardinality (to split low/high
 * category) and the date range of the chosen temporal column (to pick
 * the right time bucket). Falls back to sensible defaults when probes
 * fail or return nothing.
 *
 * Heuristics:
 *   1. If table has a temporal column → COUNT(*) grouped by that column,
 *      with `groupByBuckets[col]` set to the best bucket for the data range.
 *   2. Else pick the LOWEST-cardinality non-ID, non-text-free categorical
 *      → COUNT(*) grouped by it. Use cardinality; prefer smaller.
 *   3. Else → COUNT(*) with no grouping (widget will nudge to Number).
 */
export async function autoSummarize(
  connectionId: string,
  table: TableSchema,
): Promise<VisualQuery> {
  const columns = table.columns;

  const base: VisualQuery = {
    kind: "table",
    table: table.tableName,
    filters: [],
    summarize: [{ aggregation: "count", field: "*" }],
    groupBy: [],
    sort: [],
    limit: 500,
  };

  const temporal = columns.find((c) => classifyColumn(c, table) === "temporal");
  if (temporal) {
    const range = await probeDateRange(connectionId, table.tableName, temporal.columnName);
    const bucket = range ? guessTimeBucket(range.min, range.max) : "month";
    base.groupBy = [temporal.columnName];
    base.groupByBuckets = { [temporal.columnName]: bucket };
    base.sort = [{ column: temporal.columnName, direction: "ASC" }];
    return base;
  }

  const candidates = columns.filter((c) => {
    const type = normalizeType(c.typeName);
    if (isIdColumn(c.columnName, table)) return false;
    if (TEXT_FREE_TYPES.has(type)) return false;
    if (NUMERIC_TYPES.has(type)) return false;
    if (TEMPORAL_TYPES.has(type)) return false;
    if (BOOLEAN_TYPES.has(type)) return true;
    return true; // string-like
  });

  if (candidates.length > 0) {
    const cardinality = await probeCardinality(
      connectionId,
      table.tableName,
      candidates.map((c) => c.columnName),
    );

    const ranked = [...candidates].sort((a, b) => {
      const av = cardinality[a.columnName] || Number.MAX_SAFE_INTEGER;
      const bv = cardinality[b.columnName] || Number.MAX_SAFE_INTEGER;
      return av - bv;
    });

    const picked = ranked.find((c) => {
      const n = cardinality[c.columnName];
      return !n || n < CATEGORY_LOW_MAX;
    });

    if (picked) {
      base.groupBy = [picked.columnName];
      return base;
    }
  }

  return base;
}

export function autoPickMeasure(
  columns: ColumnSchema[],
  table?: TableSchema,
  excludeColumn?: string,
): ColumnSchema | null {
  for (const col of columns) {
    if (col.columnName === excludeColumn) continue;
    if (classifyColumn(col, table) === "measure") return col;
  }
  return null;
}

/**
 * Filter Pane field auto-pick. Uses cardinality when available to avoid
 * picking a 200-value column that would be unusable as a filter.
 */
export function autoFilterPaneField(
  table: TableSchema,
  cardinality?: CardinalityMap,
): string | null {
  const candidates = table.columns
    .map((c) => ({ col: c, kind: classifyColumn(c, table, cardinality) }))
    .filter((x) => x.kind === "category-low" || x.kind === "boolean")
    // Skip columns with only 1 distinct value — a 1-value dropdown is useless.
    // A "remove-unqualified" pass drops anything with distinct-count < 2.
    .filter((x) => {
      if (!cardinality) return true;
      const n = cardinality[x.col.columnName];
      return typeof n !== "number" || n >= 2;
    });

  candidates.sort((a, b) => {
    const av = cardinality?.[a.col.columnName] ?? Number.MAX_SAFE_INTEGER;
    const bv = cardinality?.[b.col.columnName] ?? Number.MAX_SAFE_INTEGER;
    return av - bv;
  });

  return candidates[0]?.col.columnName ?? null;
}

/** The most cells a pivot is asked to draw; `PivotWidget` shows "Pivot too large" beyond it. */
export const MAX_PIVOT_CELLS = 20000;

/** What a dimension is assumed to hold when its distinct count has not been probed. */
const UNPROBED_DISTINCT = 20;

export interface PivotLayout {
  rows: string[];
  cols: string[];
  vals: string[];
  aggregator: string;
}

export function autoPivotLayout(
  table: TableSchema,
  cardinality?: CardinalityMap,
): PivotLayout {
  // Candidate dims: low-card categories, booleans, temporals. Sort by distinct
  // count ascending — the LOWEST-cardinality dim gets promoted to columns so
  // the pivot grid stays horizontally compact. Higher-card dims go to rows
  // (users can scroll vertically much more comfortably than horizontally).
  //
  // Also include low-cardinality numeric columns that are NOT IDs — e.g. a
  // "year" INTEGER with 5 distinct values makes a much better pivot column
  // header than a genuine measure. Treat year/quarter integers as breakout
  // dimensions rather than aggregation fields.
  const dims = table.columns
    .map((c) => ({ col: c, kind: classifyColumn(c, table, cardinality) }))
    .filter((x) =>
      x.kind === "category-low" || x.kind === "boolean" || x.kind === "temporal" ||
      (x.kind === "measure" &&
        !isIdColumn(x.col.columnName, table) &&
        cardinality !== undefined &&
        typeof cardinality[x.col.columnName] === "number" &&
        cardinality[x.col.columnName] < CATEGORY_LOW_MAX),
    )
    .sort((a, b) => {
      const av = cardinality?.[a.col.columnName] ?? Number.MAX_SAFE_INTEGER;
      const bv = cardinality?.[b.col.columnName] ?? Number.MAX_SAFE_INTEGER;
      return av - bv;
    });

  // Exclude columns already used as dims from the measures list so they don't
  // appear in both roles (e.g. low-card "year" should be a pivot column, not a val).
  const dimColNames = new Set(dims.map((d) => d.col.columnName));
  const measures = table.columns.filter(
    (c) => classifyColumn(c, table) === "measure" && !dimColNames.has(c.columnName),
  );

  // pivottable.js registers aggregators as title-case ("Sum", "Count").
  const layout: PivotLayout = {
    rows: [],
    cols: [],
    vals: [],
    aggregator: measures.length > 0 ? "Sum" : "Count",
  };

  const dimNames = dims.map((d) => d.col.columnName);

  // Branching on dim count:
  //   < 2 dims : everything goes to rows (nothing to cross-tab)
  //   2-3 dims : lowest-card → columns (1), the rest → rows
  //   ≥ 4 dims : two lowest-card → columns (1+2), the rest → rows
  if (dims.length >= 4) {
    layout.cols = [dimNames[0], dimNames[1]];
    layout.rows = dimNames.slice(2);
    layout.vals = measures.length >= 1 ? [measures[0].columnName] : [];
  } else if (dims.length >= 2) {
    layout.cols = [dimNames[0]];
    layout.rows = dimNames.slice(1);
    layout.vals = measures.length >= 1 ? [measures[0].columnName] : [];
  } else if (dims.length === 1) {
    layout.rows = [dimNames[0]];
    layout.vals = measures.length >= 1
      ? measures.slice(0, 4).map((m) => m.columnName)
      : [];
  } else {
    layout.vals = measures.length >= 1 ? [measures[0].columnName] : [];
  }

  // An auto-picked pivot has to be drawable: the cross-tab has one cell per row key times column
  // key, so the dimensions with the most values (the last ones) are dropped until it fits.
  const distinct = (c: string) => Math.max(1, cardinality?.[c] || UNPROBED_DISTINCT);
  const cells = () =>
    layout.rows.reduce((n, c) => n * distinct(c), 1) * layout.cols.reduce((n, c) => n * distinct(c), 1);
  while (cells() > MAX_PIVOT_CELLS && layout.rows.length > 1) layout.rows.pop();
  while (cells() > MAX_PIVOT_CELLS && layout.cols.length > 1) layout.cols.pop();

  return layout;
}

/**
 * Given current cube selections, pick the best render mode:
 *   0 dims               → number
 *   ≥2 dims              → pivot
 *   otherwise            → chart
 */
export function suggestRenderModeForCube(
  selectedDimensions: string[],
  selectedMeasures: string[],
): WidgetType {
  const dimCount = selectedDimensions.length;
  const measureCount = selectedMeasures.length;

  if (dimCount === 0 && measureCount >= 1) return "number";
  if (dimCount === 0) return "number";
  if (dimCount >= 2) return "pivot";
  return "chart";
}

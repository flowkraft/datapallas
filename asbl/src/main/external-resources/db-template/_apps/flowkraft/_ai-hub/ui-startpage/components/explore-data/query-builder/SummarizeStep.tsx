"use client";

import { useState, useEffect } from "react";
// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";
import type { NumericBucket, TimeBucket } from "@/lib/stores/canvas-store";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import {
  nicerBinWidth, probeNumericRange, probeDateRange,
  guessTimeBucket, isTemporal,
} from "@/lib/explore-data/smart-defaults";

interface AggItem {
  aggregation: string;
  field: string;
}

const AGGREGATIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"];

/** Numeric binning presets — 4 fixed targets + Off. `numBins === null` =
 *  "don't bin" (group by raw value). */
const NUMERIC_BIN_OPTIONS: { label: string; numBins: number | null }[] = [
  { label: "Don't bin", numBins: null },
  { label: "Auto",      numBins: 8 },  // sensible default target count
  { label: "10 bins",   numBins: 10 },
  { label: "25 bins",   numBins: 25 },
  { label: "100 bins",  numBins: 100 },
];

/** Temporal bucket picker presets. "auto" means use `guessTimeBucket` against
 *  the probed data range; "none" means emit the raw timestamp. Truncation
 *  buckets preserve timeline continuity; extraction buckets produce discrete
 *  categories (day-of-week, etc.) — good for seasonality analysis. */
type TemporalBucketChoice = "auto" | "none" | TimeBucket;
const TEMPORAL_BUCKET_OPTIONS: { label: string; value: TemporalBucketChoice; group: "auto" | "truncation" | "extraction" }[] = [
  { label: "Auto",            value: "auto",           group: "auto" },
  { label: "Raw timestamp",   value: "none",           group: "auto" },
  { label: "Day",             value: "day",            group: "truncation" },
  { label: "Week",            value: "week",           group: "truncation" },
  { label: "Month",           value: "month",          group: "truncation" },
  { label: "Quarter",         value: "quarter",        group: "truncation" },
  { label: "Year",            value: "year",           group: "truncation" },
  { label: "Day of week",     value: "day-of-week",    group: "extraction" },
  { label: "Hour of day",     value: "hour-of-day",    group: "extraction" },
  { label: "Month of year",   value: "month-of-year",  group: "extraction" },
  { label: "Quarter of year", value: "quarter-of-year", group: "extraction" },
];

interface SummarizeStepProps {
  columns: ColumnSchema[];
  summarize: AggItem[];
  groupBy: string[];
  groupByNumericBuckets?: Record<string, NumericBucket>;
  groupByBuckets?: Record<string, TimeBucket>;
  onChange: (
    summarize: AggItem[],
    groupBy: string[],
    groupByNumericBuckets?: Record<string, NumericBucket>,
    groupByBuckets?: Record<string, TimeBucket>,
  ) => void;
  /** For the numeric-range + date-range probes. When absent, the pickers
   *  still render — numeric picks fall back to width 1, temporal picks fall
   *  back to "month" instead of data-range-aware `guessTimeBucket`. */
  connectionId?: string | null;
  tableName?: string | null;
}

export function SummarizeStep({
  columns, summarize, groupBy,
  groupByNumericBuckets = {},
  groupByBuckets = {},
  onChange, connectionId, tableName,
}: SummarizeStepProps) {
  // Columns keyed by name — avoid repeated finds.
  const colByName = Object.fromEntries(columns.map((c) => [c.columnName, c]));

  // Probe caches — filled on demand / lazily on group-by add. Keyed per-column
  // so each column is probed at most once per query edit session (the probe
  // helpers themselves add a 5-min TTL cache on top).
  const [numRangeByCol, setNumRangeByCol] = useState<Record<string, { min: number; max: number } | null>>({});
  const [dateRangeByCol, setDateRangeByCol] = useState<Record<string, { min: string; max: string } | null>>({});
  const [probingCol, setProbingCol] = useState<string | null>(null);

  const isNumericGroupByColumn = (colName: string): boolean => {
    const c = colByName[colName];
    return !!c && getFieldKind(c) === "measure";
  };
  const isTemporalGroupByColumn = (colName: string): boolean => {
    const c = colByName[colName];
    return !!c && isTemporal(c);
  };

  const addAgg = () => {
    onChange(
      [...summarize, { aggregation: "COUNT", field: columns[0]?.columnName || "" }],
      groupBy,
      groupByNumericBuckets,
      groupByBuckets,
    );
  };

  const updateAgg = (i: number, patch: Partial<AggItem>) => {
    const updated = summarize.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
    onChange(updated, groupBy, groupByNumericBuckets, groupByBuckets);
  };

  const removeAgg = (i: number) => {
    onChange(summarize.filter((_, idx) => idx !== i), groupBy, groupByNumericBuckets, groupByBuckets);
  };

  // Add a column to group-by. When the column is temporal, auto-populate a
  // bucket using `guessTimeBucket` against the probed date range — silent
  // and background (no loading spinner) so the user isn't blocked while the
  // min/max query runs.
  const addToGroupBy = async (col: string) => {
    const next = [...groupBy, col];
    const nextBuckets = { ...groupByBuckets };

    const c = colByName[col];
    if (c && isTemporal(c) && !nextBuckets[col]) {
      // Optimistic: set "month" immediately so the user sees *some* bucket,
      // then refine from the probe.
      nextBuckets[col] = "month";
    }

    // Commit the toggle first so the user isn't waiting on the probe.
    onChange(summarize, next, groupByNumericBuckets, nextBuckets);

    if (c && isTemporal(c) && connectionId && tableName) {
      const existing = dateRangeByCol[col];
      let range = existing;
      if (!range) {
        try {
          range = await probeDateRange(connectionId, tableName, col);
        } catch { range = null; }
        setDateRangeByCol((prev) => ({ ...prev, [col]: range ?? null }));
      }
      if (range) {
        const bucket = guessTimeBucket(range.min, range.max);
        onChange(summarize, next, groupByNumericBuckets, { ...nextBuckets, [col]: bucket });
      }
    }
  };

  const removeFromGroupBy = (col: string) => {
    const next = groupBy.filter((g) => g !== col);
    // Drop bucket entries when the column leaves group-by.
    const { [col]: _n, ...restNum } = groupByNumericBuckets;
    const { [col]: _t, ...restTime } = groupByBuckets;
    onChange(summarize, next, restNum, restTime);
  };

  const toggleGroupBy = (col: string) => {
    if (groupBy.includes(col)) removeFromGroupBy(col);
    else void addToGroupBy(col);
  };

  const setNumericBucket = async (col: string, numBins: number | null) => {
    // "Don't bin" → drop from the map entirely so the SQL builder emits the raw column.
    if (numBins == null) {
      const { [col]: _dropped, ...rest } = groupByNumericBuckets;
      onChange(summarize, groupBy, rest, groupByBuckets);
      return;
    }
    // Ensure we have a min/max range for this column. Probe on demand.
    let range = numRangeByCol[col];
    if (!range && connectionId && tableName) {
      setProbingCol(col);
      try {
        range = await probeNumericRange(connectionId, tableName, col);
      } finally {
        setProbingCol(null);
      }
      setNumRangeByCol((prev) => ({ ...prev, [col]: range ?? null }));
    }
    const width = range
      ? nicerBinWidth(range.min, range.max, numBins)
      : 1;  // fallback when probe unavailable
    onChange(summarize, groupBy, {
      ...groupByNumericBuckets,
      [col]: { width, numBins },
    }, groupByBuckets);
  };

  const setTemporalBucket = async (col: string, choice: TemporalBucketChoice) => {
    // "Raw timestamp" → drop the entry so SQL builder emits the raw column.
    if (choice === "none") {
      const { [col]: _dropped, ...rest } = groupByBuckets;
      onChange(summarize, groupBy, groupByNumericBuckets, rest);
      return;
    }
    // Explicit bucket — use as-is.
    if (choice !== "auto") {
      onChange(summarize, groupBy, groupByNumericBuckets, { ...groupByBuckets, [col]: choice });
      return;
    }
    // "Auto" → probe (if needed) and use guessTimeBucket.
    let range = dateRangeByCol[col];
    if (!range && connectionId && tableName) {
      setProbingCol(col);
      try {
        range = await probeDateRange(connectionId, tableName, col);
      } finally {
        setProbingCol(null);
      }
      setDateRangeByCol((prev) => ({ ...prev, [col]: range ?? null }));
    }
    const bucket = range ? guessTimeBucket(range.min, range.max) : "month";
    onChange(summarize, groupBy, groupByNumericBuckets, { ...groupByBuckets, [col]: bucket });
  };

  // Pre-load ranges for numeric + temporal group-by columns that don't have a
  // cached range yet. Runs quietly in the background so the picker dropdowns
  // are responsive when the user interacts with them.
  useEffect(() => {
    if (!connectionId || !tableName) return;
    let cancelled = false;
    (async () => {
      for (const col of groupBy) {
        if (isNumericGroupByColumn(col) && !(col in numRangeByCol)) {
          const range = await probeNumericRange(connectionId, tableName, col).catch(() => null);
          if (cancelled) return;
          setNumRangeByCol((prev) => ({ ...prev, [col]: range ?? null }));
        }
        if (isTemporalGroupByColumn(col) && !(col in dateRangeByCol)) {
          const range = await probeDateRange(connectionId, tableName, col).catch(() => null);
          if (cancelled) return;
          setDateRangeByCol((prev) => ({ ...prev, [col]: range ?? null }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tableName, groupBy.join("\u0000")]);

  const selectedGroupBy = groupBy.map((col) => ({ col, schema: colByName[col] }));
  const unselectedColumns = columns.filter((c) => !groupBy.includes(c.columnName));

  return (
    <div className="space-y-1.5">
      {/* Aggregations */}
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-blue-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
        <span className="text-xs text-base-content/60">Summarize</span>
        <button id="btnAddAggregation" onClick={addAgg} className="p-0.5 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>

      {summarize.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5 ml-6">
          <select
            id={`selectAggFunc-${i}`}
            value={a.aggregation}
            onChange={(e) => updateAgg(i, { aggregation: e.target.value })}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content w-20"
          >
            {AGGREGATIONS.map((agg) => (
              <option key={agg} value={agg}>{agg}</option>
            ))}
          </select>
          <span className="text-xs text-base-content/60">of</span>
          <select
            id={`selectAggField-${i}`}
            value={a.field}
            onChange={(e) => updateAgg(i, { field: e.target.value })}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
          >
            {columns.map((c) => (
              <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
            ))}
          </select>
          <button id={`btnRemoveAgg-${i}`} onClick={() => removeAgg(i)} className="p-0.5 rounded hover:bg-error/10 text-base-content/60 hover:text-error">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      {/* Group By — only show when there are aggregations */}
      {summarize.length > 0 && (
        <div className="ml-6 space-y-1">
          <span className="text-xs text-base-content/60">Group by:</span>

          {/* Selected group-by rows. Each row = col name + (bucket picker for numerics) + × */}
          {selectedGroupBy.length > 0 && (
            <div className="space-y-1">
              {selectedGroupBy.map(({ col, schema }) => {
                const isNumeric = schema ? getFieldKind(schema) === "measure" : false;
                const isDateCol = schema ? isTemporal(schema) : false;
                const currentNumBucket = groupByNumericBuckets[col];
                const currentNumBins = currentNumBucket?.numBins ?? null;
                const numRange = numRangeByCol[col];
                const currentTimeBucket = groupByBuckets[col];
                const dateRange = dateRangeByCol[col];
                const isProbing = probingCol === col;
                return (
                  <div key={col} className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border bg-primary/10 border-primary/30 text-primary`}
                    >
                      {col}
                    </span>
                    {isNumeric && (
                      <>
                        <span className="text-[10px] text-base-content/60">bin:</span>
                        <select
                          value={currentNumBins == null ? "none" : String(currentNumBins)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNumericBucket(col, v === "none" ? null : Number(v));
                          }}
                          disabled={isProbing}
                          className="text-[11px] bg-base-100 border border-base-300 rounded px-1.5 py-0.5 text-base-content"
                          title={numRange
                            ? `Column range: ${numRange.min} – ${numRange.max}${currentNumBucket ? ` (width ${currentNumBucket.width})` : ""}`
                            : "Range not yet probed"}
                        >
                          {NUMERIC_BIN_OPTIONS.map((opt) => (
                            <option
                              key={opt.label}
                              value={opt.numBins == null ? "none" : String(opt.numBins)}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {isDateCol && (
                      <>
                        <span className="text-[10px] text-base-content/60">bucket:</span>
                        <select
                          value={currentTimeBucket ?? "none"}
                          onChange={(e) => setTemporalBucket(col, e.target.value as TemporalBucketChoice)}
                          disabled={isProbing}
                          className="text-[11px] bg-base-100 border border-base-300 rounded px-1.5 py-0.5 text-base-content"
                          title={dateRange
                            ? `Column range: ${dateRange.min} – ${dateRange.max}${currentTimeBucket ? ` (using ${currentTimeBucket})` : ""}`
                            : "Range not yet probed — pick a bucket to override"}
                        >
                          <optgroup label="Auto">
                            {TEMPORAL_BUCKET_OPTIONS.filter((o) => o.group === "auto").map((o) => (
                              <option key={o.label} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Truncation (timeline)">
                            {TEMPORAL_BUCKET_OPTIONS.filter((o) => o.group === "truncation").map((o) => (
                              <option key={o.label} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Extraction (discrete)">
                            {TEMPORAL_BUCKET_OPTIONS.filter((o) => o.group === "extraction").map((o) => (
                              <option key={o.label} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                        </select>
                      </>
                    )}
                    {isProbing && <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                    <button
                      id={`btnRemoveGroupBy-${col}`}
                      onClick={() => toggleGroupBy(col)}
                      className="p-0.5 rounded hover:bg-error/10 text-base-content/60 hover:text-error"
                      aria-label={`Remove ${col} from group-by`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unselected-column pills — click to add */}
          {unselectedColumns.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {unselectedColumns.map((c) => (
                <button
                  key={c.columnName}
                  id={`btnGroupBy-${c.columnName}`}
                  onClick={() => toggleGroupBy(c.columnName)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-base-300 text-base-content/60 hover:border-foreground/30"
                >
                  {c.columnName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

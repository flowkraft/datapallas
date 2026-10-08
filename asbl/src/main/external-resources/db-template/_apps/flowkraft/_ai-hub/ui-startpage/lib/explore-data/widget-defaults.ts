// Pure helpers for widget-type and display-config defaults.
//
// These compose smart-defaults/* primitives (pickWidget, rankChartSubtypes,
// autoPickMeasure, pickGaugeField, …) into the shape that both the
// canvas-store's one-shot auto-switch (setWidgetQueryResult) and the
// ConfigPanel palette onClick need.  Kept outside `smart-defaults/` because
// they touch DataSource / WidgetDisplayConfig / WidgetType — types owned by
// the canvas-store — and because they write shapes (config patches, type
// choices) that are consumed imperatively by store mutators, not just
// classifier-side.

import type { DataSource, VisualQuery, WidgetDisplayConfig, WidgetType } from "@/lib/stores/canvas-store";
import type { ColumnSchema, QueryResult, TableSchema } from "./types";
import {
  autoFilterPaneField, autoPickMeasure, autoPivotLayout,
  pickGaugeField, pickProgressField, pickTrendFields,
  pickSankeyFields, pickDetailDefaults, pickMapDefaults, splitDimsAndMeasures,
  rankChartSubtypes, shapeFromResult, pickDefaultAxes, type CardinalityMap,
} from "./smart-defaults";
import { pickWidget, type PickShape } from "./smart-defaults/widget-picker";
import { pickColumnFormat } from "./type-formatters";

/** Return only the raw ColumnSchema entries whose column names appear in
 *  `widget.shape.dims`.  Used by config panels (MapConfig, TrendConfig,
 *  SankeyConfig, …) to populate their "dimension" `<select>` dropdowns
 *  without re-running classification.  The shape is the single authority;
 *  this helper is pure lookup.  Falls back to the cols argument when shape
 *  is null (pre-query / pre-schema-fetch state). */
export function dimensionsOf(
  columns: ColumnSchema[] | null,
  shape: PickShape | null,
): ColumnSchema[] {
  const cols = columns ?? [];
  if (!shape) return cols;
  const names = new Set(shape.dims.map((d) => d.name));
  return cols.filter((c) => names.has(c.columnName));
}

/** Same as `dimensionsOf` but for the measures bucket. */
export function measuresOf(
  columns: ColumnSchema[] | null,
  shape: PickShape | null,
): ColumnSchema[] {
  const cols = columns ?? [];
  if (!shape) return cols;
  const names = new Set(shape.measures.map((m) => m.name));
  return cols.filter((c) => names.has(c.columnName));
}

/** Dims whose classified kind is "temporal" — the time-axis candidates
 *  for TrendConfig and any other panel that needs a date dropdown.  The
 *  `kind` flag is populated by `shapeFromResult` / `shapeFromColumns`
 *  using the same rules as `classifyColumn` + the computed-alias name
 *  fallback (order_month → temporal).  Consumers used to call
 *  `columns.filter(isTemporalLike)` locally, which ran the name tokenizer
 *  again per render — now they read the pre-classified flag. */
export function temporalDimensionsOf(
  columns: ColumnSchema[] | null,
  shape: PickShape | null,
): ColumnSchema[] {
  const cols = columns ?? [];
  if (!shape) return cols;
  const names = new Set(
    shape.dims.filter((d) => d.kind === "temporal").map((d) => d.name),
  );
  return cols.filter((c) => names.has(c.columnName));
}

/** Names of columns classified as temporal — the form `buildSql` consumes
 *  via `BuildSqlOptions.temporalColumns` to wrap LHS of SQLite filter
 *  comparisons with `date(sqliteDateNormalize(c))`. Returns an empty set
 *  when no shape exists yet (pre-query): the resulting no-op preserves
 *  pre-fix filter behavior on the cold path. */
export function temporalColumnNamesOf(
  shape: PickShape | null | undefined,
): ReadonlySet<string> {
  if (!shape) return new Set<string>();
  return new Set(
    shape.dims.filter((d) => d.kind === "temporal").map((d) => d.name),
  );
}

/** Synthesize the post-aggregation column list from a raw table schema +
 *  a visual query's summarize/groupBy.  For raw-table drops (no summarize,
 *  no groupBy) returns `baseCols` unchanged — the table's schema IS the
 *  result shape.  For aggregated queries, walks groupBy (keeping schema
 *  types — TIMESTAMP / BOOLEAN / etc.) + adds one synthetic DOUBLE column
 *  per summarize entry.
 *
 *  Used by ConfigPanel during visual-mode pre-query setup so the
 *  `widget.columns` / `widget.shape` written to the store always reflects
 *  WHAT WILL APPEAR IN THE RESULT, not the raw table.  Eliminates the need
 *  for every palette / config consumer to re-synthesize locally. */
export function synthesizePostAggColumns(
  baseCols: ColumnSchema[],
  visualQuery: VisualQuery | undefined,
): ColumnSchema[] {
  if (!visualQuery) return baseCols;
  const hasSummarize = (visualQuery.summarize?.length ?? 0) > 0;
  const hasGroupBy = (visualQuery.groupBy?.length ?? 0) > 0;
  if (!hasSummarize && !hasGroupBy) return baseCols;

  const result: ColumnSchema[] = [];
  for (const col of (visualQuery.groupBy ?? [])) {
    const schemaCol = baseCols.find((c) => c.columnName === col);
    if (schemaCol) result.push(schemaCol);
  }
  for (const s of (visualQuery.summarize ?? [])) {
    result.push({
      // COUNT of rows is written as COUNT(*) under the name `count` (the SQL builder's alias).
      columnName: s.field === "*" && (s.aggregation as string).toUpperCase() === "COUNT"
        ? "count" : `${s.field}_${(s.aggregation as string).toLowerCase()}`,
      typeName: "DOUBLE",
      isNullable: true,
    });
  }
  return result.length > 0 ? result : baseCols;
}

/** Infer column metadata from a single result row.
 *
 *  Used in non-visual modes (SQL/AI-SQL/Script) where we don't have source
 *  table schema.  Type inference is purely from the JS primitive (number →
 *  DOUBLE, boolean → BOOLEAN, else VARCHAR).  We do NOT try to detect
 *  date-shaped strings as TIMESTAMP — that would force narrow `isTemporal`
 *  (used by date formatters) to treat a string like "2024-01" as a real
 *  date, which it isn't.  Name-based temporal detection lives in
 *  `classifyColumn` / `isTemporalLike`; shape.dims[].kind already reports
 *  "temporal" for such columns without lying about the JDBC type. */
export function inferColumnsFromRow(row: Record<string, unknown>): ColumnSchema[] {
  return Object.entries(row).map(([name, value]) => ({
    columnName: name,
    typeName: typeof value === "number" ? "DOUBLE"
            : typeof value === "boolean" ? "BOOLEAN"
            : "VARCHAR",
    isNullable: true,
  }));
}

/** Compute the auto-pick displayConfig patch for a target widget type.
 *
 *  Shared by (a) the canvas-store's one-shot auto-switch on first query
 *  result and (b) ConfigPanel's palette onClick when a user picks a widget
 *  type explicitly.  Without this, switching to Number / Gauge / Progress /
 *  Trend / Sankey would leave the ConfigPanel's `<select>` empty even though
 *  the Widget has perfectly good render-time auto-pick logic — because the
 *  select reads `config.<field>` directly and render-time picks never write
 *  back to displayConfig.
 *
 *  Returns `null` when nothing needs to change (user already set the fields,
 *  or no suitable columns exist).  Each seeded field carries an
 *  `_auto_<field>` flag so future UX can show a "picked for you" badge and
 *  distinguish auto-picked vs. user-picked values. */
export function seedDisplayConfigForType(
  type: WidgetType,
  currentConfig: WidgetDisplayConfig,
  columns: ColumnSchema[],
  hints: { cardinality: CardinalityMap; extractions: Set<string> },
  shape?: PickShape | null,
): WidgetDisplayConfig | null {
  const next: WidgetDisplayConfig = { ...currentConfig };
  let changed = false;

  const seed = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (currentConfig[key]) return;   // respect any value the user already set
    next[key] = value;
    next[`_auto_${key}`] = true;
    changed = true;
  };

  switch (type) {
    case "chart": {
      // Seed into the canonical DSL Map at displayConfig.dslConfig (Principle 4).
      const { dims, measures } = shape
        ? {
            dims: columns.filter((c) => shape.dims.some((d) => d.name === c.columnName)),
            measures: columns.filter((c) => shape.measures.some((m) => m.name === c.columnName)),
          }
        : splitDimsAndMeasures(columns);
      const existing = (currentConfig.dslConfig ?? {}) as Record<string, unknown>;
      const existingData = (existing.data ?? {}) as { labelField?: string; seriesField?: string; datasets?: { field: string; label?: string }[] };
      // Carry forward only chart-canonical keys (type / data / options) from
      // any existing dslConfig. A blanket `{ ...existing }` would leak fields
      // from a prior widget-type era — e.g. tabulator's `layout`/`autoColumns`
      // or pivot's `rows`/`cols`/`vals` — into the chart DSL output. Aligns
      // chart with how pivot/tabulator/filter-pane cases below already behave
      // (wholesale-replace) per DSLPrinciplesReadme Principle 4.
      const dslPatch: Record<string, unknown> = {};
      if (existing.type !== undefined) dslPatch.type = existing.type;
      if (existing.data !== undefined) dslPatch.data = existing.data;
      if (existing.options !== undefined) dslPatch.options = existing.options;
      let dslChanged = false;
      if (!existing.type) {
        const subtype = rankChartSubtypes(dims, measures, {
          cardinality: hints.cardinality,
          extractions: hints.extractions,
        })[0];
        if (subtype) {
          dslPatch.type = subtype;
          dslChanged = true;
        }
      }
      const hasLabelField = typeof existingData.labelField === "string" && existingData.labelField;
      const hasDatasets = Array.isArray(existingData.datasets) && existingData.datasets.length > 0;
      if (!hasLabelField && !hasDatasets) {
        const chartType = (dslPatch.type ?? existing.type ?? "bar") as string;
        const axes = pickDefaultAxes(dims, measures, chartType);
        const newData: { labelField?: string; seriesField?: string; datasets?: { field: string; label?: string }[] } = { ...existingData };
        if (axes.xFields.length > 0) {
          newData.labelField = axes.xFields[0];
          if (axes.xFields.length > 1) newData.seriesField = axes.xFields[1];
          dslChanged = true;
        }
        if (axes.yFields.length > 0) {
          newData.datasets = axes.yFields.map((f) => ({ field: f, label: f }));
          dslChanged = true;
        }
        if (dslChanged) dslPatch.data = newData;
      }
      if (dslChanged) {
        next.dslConfig = dslPatch;
        changed = true;
      }
      break;
    }
    case "number": {
      const col = autoPickMeasure(columns);
      seed("numberField", col?.columnName);
      if (col) {
        const spec = pickColumnFormat(col);
        seed("numberFormat", spec.kind === "currency" ? "currency" : "number");
      }
      break;
    }
    case "gauge": {
      const { field } = pickGaugeField(columns);
      seed("field", field);
      break;
    }
    case "progress": {
      const { field } = pickProgressField(columns);
      seed("field", field);
      break;
    }
    case "trend": {
      const picks = pickTrendFields(columns);
      seed("dateField", picks.dateField);
      seed("valueField", picks.valueField);
      break;
    }
    case "sankey": {
      const picks = pickSankeyFields(columns, { cardinality: hints.cardinality });
      seed("sourceField", picks.sourceField);
      seed("targetField", picks.targetField);
      seed("valueField", picks.valueField);
      break;
    }
    case "detail": {
      if (!currentConfig.hiddenColumns) {
        const { hiddenColumns } = pickDetailDefaults(columns);
        if (hiddenColumns.length > 0) {
          next.hiddenColumns = hiddenColumns;
          next._auto_hiddenColumns = true;
          changed = true;
        }
      }
      break;
    }
    case "map": {
      // Geo seed — mirrors the reference defaultDisplay() for country/state +
      // measure: state → us_states region, country → world_countries region,
      // lat+lon pair → pin. Without this, palette-click → map left mapType
      // unset and MapConfig's `btnMapType-region` was never aria-pressed.
      const picks = pickMapDefaults(columns);
      seed("mapType",   picks.mapType);
      seed("region",    picks.region);
      seed("dimension", picks.dimension);
      seed("latField",  picks.latField);
      seed("lonField",  picks.lonField);
      seed("metric",    picks.metric);
      break;
    }
    case "pivot": {
      // Seed canonical pivot DSL Map at displayConfig.dslConfig (Principle 4
      // in DSLPrinciplesReadme). Required because the chart case writes
      // `dslConfig = { type, data: { labelField, datasets, seriesField } }`
      // before the user may switch the widget to a pivot via the Visualize-as
      // palette; without a pivot-shape seed here, that stale chart-shape
      // survives into publish and the strict pivot parser crashes with
      // MissingMethodException on `.type('bar')` inside `pivotTable(...)`.
      const existing = (currentConfig.dslConfig ?? {}) as Record<string, unknown>;
      const hasCanonicalPivot =
        Array.isArray(existing.rows) || Array.isArray(existing.cols) || Array.isArray(existing.vals);
      if (!hasCanonicalPivot) {
        const stubTable: TableSchema = {
          tableName: "",
          tableType: "TABLE",
          columns,
          primaryKeyColumns: [],
        };
        const layout = autoPivotLayout(stubTable, hints.cardinality);
        // Wholesale replace — any prior chart-shape `dslConfig` (`type`,
        // `data`) is illegal in the pivot DSL surface and must not be
        // preserved across a type switch.
        next.dslConfig = {
          rows: layout.rows,
          cols: layout.cols,
          vals: layout.vals,
          aggregatorName: layout.aggregator,
          rendererName: "Table",
        };
        changed = true;
      }
      break;
    }
    case "tabulator": {
      // Seed canonical tabulator DSL Map at displayConfig.dslConfig (Principle 4
      // in DSLPrinciplesReadme). Same root cause as the pivot case above: the
      // chart case writes a chart-shape `dslConfig` that survives a switch to
      // tabulator via the Visualize-as palette; the publisher then emits
      // `tabulator('id') { type 'bar'; data([labelField:..., datasets:[...]]) }`
      // and the tabulator parser rejects the alien `type`/`data` methods.
      // Mirrors the Java emitter's empty-fallback at DashboardFileGenerator.java
      // line 357-358 — `{ layout: 'fitColumns', autoColumns: true }`.
      const existing = (currentConfig.dslConfig ?? {}) as Record<string, unknown>;
      const hasCanonicalTabulator =
        typeof existing.layout === "string" || Array.isArray(existing.columns);
      if (!hasCanonicalTabulator) {
        next.dslConfig = {
          layout: "fitColumns",
          autoColumns: true,
        };
        changed = true;
      }
      break;
    }
    case "filter-pane": {
      // Seed canonical filterPane DSL Map at displayConfig.dslConfig (Principle 4).
      // Same drift class as pivot/tabulator. The strict filterPane parser
      // (no methodMissing) would crash on `type 'bar'`; the publisher pre-empts
      // that by emitting `// filterPane('id') — no field configured` whenever
      // dslConfig lacks a `field` — so the filter SILENTLY VANISHES from the
      // published dashboard. Seed a sensible field via the existing
      // autoFilterPaneField helper.
      const existing = (currentConfig.dslConfig ?? {}) as Record<string, unknown>;
      const hasCanonicalField = typeof existing.field === "string" && (existing.field as string).length > 0;
      if (!hasCanonicalField) {
        const stubTable: TableSchema = {
          tableName: "",
          tableType: "TABLE",
          columns,
          primaryKeyColumns: [],
        };
        const field = autoFilterPaneField(stubTable, hints.cardinality);
        if (field) {
          // Wholesale replace — chart-shape `type`/`data` are illegal in the
          // filterPane DSL surface and must not be preserved across a type
          // switch.
          next.dslConfig = {
            field,
            label: field,
            sort: "asc",
            maxValues: 500,
            showSearch: true,
            multiSelect: true,
          };
          changed = true;
        }
      }
      break;
    }
    // text / divider / iframe —
    // no deterministic "first column to pre-select" default worth writing.
  }
  return changed ? next : null;
}

/** Compute the classified shape + raw columns from a query result.
 *
 *  This is the ONE authoritative place that translates a raw QueryResult into
 *  the `{ columns, shape }` pair that every downstream consumer needs.
 *  Called by the store mutator `setWidgetQueryResult` to write both fields
 *  onto the widget record atomically.  After this refactor, no consumer
 *  (ConfigPanel, MapConfig, TrendConfig, widget-sensibility, palette, widget
 *  renderers) re-runs classification locally — they read `widget.columns`
 *  and `widget.shape` from the store.
 *
 *  Returns `null` for empty result sets so callers can distinguish "we ran
 *  the query and got no data" from "we have data but it's un-classifiable". */
export function computeWidgetShape(
  result: QueryResult,
  dataSource: DataSource | null,
): { columns: ColumnSchema[]; shape: PickShape } | null {
  if (!result.data || result.data.length === 0) return null;
  const columns = inferColumnsFromRow(result.data[0]);
  const { dims: dimCols, measures: measureCols } = splitDimsAndMeasures(columns);
  const allNames = columns.map((c) => c.columnName);
  const vq = dataSource?.mode === "visual" ? dataSource.visualQuery : undefined;
  // Visual query has the authoritative GROUP BY list — use it instead of type-inferred dims.
  // inferColumnsFromRow assigns typeName="DOUBLE" to all numeric JS values, so
  // splitDimsAndMeasures cannot distinguish a GROUP BY TINYINT from an aggregated DOUBLE.
  const dimNames = vq?.groupBy?.length ? vq.groupBy : dimCols.map((c) => c.columnName);
  const measureNames = measureCols.map((c) => c.columnName);
  // shapeFromResult honors temporal-extraction buckets (day-of-week etc.) and
  // cross-references the schema for semantic hints — see display.ts.
  const shape = shapeFromResult(
    allNames,
    dimNames,
    vq?.groupByBuckets,
    measureNames,
    null,
    undefined,
    columns,
  );
  return { columns, shape };
}

/** Derive the best-fit widget type + default displayConfig given a
 *  precomputed shape.  Mirrors the reference `defaultDisplay()`: returns both
 *  the type and the per-rule displayConfig (e.g. Rule 4 returns
 *  `{ mapType: "region", region: "world_countries" }` for country+measure).
 *
 *  Accepts a `PickShape` directly rather than rebuilding it — the store
 *  mutator calls `computeWidgetShape` once and shares the result with this
 *  function, so no double classification. */
export function resolveAutoWidget(
  shape: PickShape,
  rowCount: number | undefined,
  isAggregated: boolean | undefined,
): { type: WidgetType; displayConfig?: Record<string, unknown> } {
  const pick = pickWidget(shape, { rowCount, isAggregated });
  return { type: pick.best, displayConfig: pick.displayConfig };
}

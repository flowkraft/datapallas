import { create } from "zustand";
import type { ColumnSchema, QueryResult, TableSchema } from "@/lib/explore-data/types";
import type { ComputedColumn } from "@/lib/explore-data/computed-columns";
import type { AggregateCondition } from "@/lib/explore-data/aggregations";
import type { FilterMatch } from "@/lib/explore-data/filter-operators";
import type { PickShape } from "@/lib/explore-data/smart-defaults/widget-picker";
import type { CardinalityMap } from "@/lib/explore-data/smart-defaults/classification";
import {
  computeWidgetShape,
  seedDisplayConfigForType,
  resolveAutoWidget,
} from "@/lib/explore-data/widget-defaults";
import { shapeFromColumns } from "@/lib/explore-data/smart-defaults/widget-picker";
import { clearWidgetExecCache } from "@/lib/explore-data/widget-exec-cache";

// --- Types ---

export type WidgetType =
  | "chart" | "tabulator" | "pivot" | "number" | "map"
  | "sankey" | "gauge" | "trend" | "progress" | "detail"
  | "text" | "divider" | "iframe" | "filter-pane";

export type DataSourceMode = "visual" | "ai-sql" | "sql" | "script";

/** Temporal group-by bucket.
 *
 *  Truncation family (keeps temporal ordering — timeline):
 *    day | week | month | quarter | year
 *
 *  Extraction family (produces discrete categories — e.g. 0-6 for day-of-week):
 *    day-of-week | hour-of-day | month-of-year | quarter-of-year
 *
 *  The two families render differently — extraction dims are categorical
 *  (bar), truncation dims are a timeline (line). The `isTemporalExtraction()`
 *  helper in smart-defaults tells them apart. */
export type TimeBucket =
  | "day" | "week" | "month" | "quarter" | "year"
  | "day-of-week" | "hour-of-day" | "month-of-year" | "quarter-of-year";

/** Numeric group-by bucket — binning width in column units.
 *  `numBins` captures the user's intent (Auto / 10 / 25 / 100); `width` is
 *  the pre-computed width at pick time (from `nicerBinWidth()` over the
 *  column's probed range). The SQL builder re-derives a tighter width from
 *  active filter bounds when `numBins` is set and a matching filter exists
 *  — bin boundaries follow the visible range, not the full column span. */
export interface NumericBucket {
  width: number;
  numBins?: number;
}

/** What a person ticked in a cube's field tree, in the structured query's own words.
 *
 *  It is what `<rb-cube-renderer>` reports through `selectionChanged` and what it takes back
 *  through `applySelection`, so reopening a widget restores the very ticks, grains and filter
 *  chips it was saved with. The same shape is sent to `/generate-sql` for the frozen SQL, and,
 *  for a widget with `showInDashboard`, written into the published `-cube-widgets.json` as the
 *  selection the dashboard opens with. A dimension carries its grain in its own name
 *  (`OrderDate.month`); `granularities` says the same thing the way the backend's map form does.
 */
/** A dashboard parameter, bound to a member of the cube by the author (R1).
 *
 *  A cube declares no parameters: the dashboard declares them once, in its
 *  `{reportId}-report-parameters-spec.groovy`, and the name is the whole link. What the author
 *  says here is which member the dashboard's `country` narrows, and how - the cube counterpart of
 *  the Filter step's bind chip. It is kept beside the ticks rather than written into them, so the
 *  question the tree asks and the dashboard's own filter stay two separate things: the first is
 *  the author's, the second is the viewer's, and only the export puts them together.
 */
export interface CubeParamBinding {
  /** The dashboard parameter's id, as its spec declares it: `country`. */
  param: string;
  /** The parameter holding the upper end, when the operator is `between` (F8's two boxes). */
  paramTo?: string;
  /** The cube member it narrows: a dimension, or a measure - which is a HAVING. */
  member: string;
  /** How, as the Filter step's chip names it (`in`, `equals`, …). Absent means `in`. */
  operator?: string;
}

export interface CubeSelection {
  dimensions: string[];
  measures: string[];
  segments: string[];
  filters: { member: string; operator: string; values: string[] }[];
  granularities: Record<string, string>;
  order: { member: string; dir: string }[];
  limit: number | null;
  /** The dashboard parameters the author bound to members of this cube (R1). Absent on every
   *  canvas saved before this existed, which therefore generates the SQL it did. */
  paramBindings?: CubeParamBinding[];
}

export interface VisualQuery {
  // Discriminator: "table" (default, backward-compatible) drives the existing
  // SQL builder. "cube" routes the widget to <rb-cube-renderer> instead.
  kind?: "table" | "cube";
  // For kind === "cube" — the cube id from /api/cubes
  cubeId?: string;
  /** The cube inside that file, when it holds several. Absent means the unnamed one. */
  cubeName?: string;
  table: string;
  // The schema `table` lives in — set by the schema browser ONLY when that
  // schema differs from the connection's default one (`SchemaInfo.defaultSchema`).
  // A table in `main`, `public` or `dbo` leaves it unset, so its SQL, its probe
  // cache key and its `btnTable-…` element id are exactly what they were before
  // AI Hub could see schemas at all, and every canvas saved until now still
  // resolves and still generates the same SQL. See `table-ref.ts`.
  tableSchema?: string;
  // Named columns the query computes for itself - one arithmetic step over two
  // operands, each a numeric column or a number (`computed-columns.ts`). Their
  // names are usable in Filter, Summarize and Sort like a column's, because the
  // SQL builder resolves a name to its expression everywhere. Absent on every
  // canvas saved before this existed, which therefore generates the SQL it did.
  computed?: ComputedColumn[];
  // Whether a row has to pass every filter (`all`, the default and what every
  // canvas saved before this existed means) or any one of them (`any`, joined
  // with OR - `filter-operators.ts`).
  filterMatch?: FilterMatch;
  filters: { column: string; operator: string; value: string; valueTo?: string }[];
  // An aggregate may carry a condition (`having`): the rows it keeps are the
  // groups whose aggregate passes it ("customers with more than 5 orders"),
  // which is what a WHERE cannot say. Absent on every canvas saved before this
  // existed, which therefore generates the SQL it did.
  // `share` reads an aggregate as the % of the whole result (F9); absent means
  // the plain aggregate, which is what every canvas saved before means.
  summarize: {
    aggregation: string; field: string; having?: AggregateCondition;
    share?: boolean; runningTotal?: boolean;
  }[];
  groupBy: string[];
  // Optional per-column time bucket. When set and the column is in `groupBy`,
  // the SQL builder replaces the raw column with a date-truncated/extracted
  // expression in both SELECT and GROUP BY. Columns without an entry group by
  // raw value.
  groupByBuckets?: Record<string, TimeBucket>;
  // Optional per-column numeric bin width. Same wiring as groupByBuckets but
  // for numeric columns — the SQL builder emits FLOOR(col/width)*width.
  groupByNumericBuckets?: Record<string, NumericBucket>;
  sort: { column: string; direction: "ASC" | "DESC" }[];
  limit: number;
  // For kind === "cube" — the cube's own selection, kept beside the table query's steps because
  // a cube widget has no columns, filters or sort of its own: the field tree holds all of it.
  // Absent on every canvas saved before this existed, which therefore reopens with an empty tree
  // exactly as it did.
  cubeSelection?: CubeSelection;
  // Show In Dashboard: unchecked (or absent, which is every canvas saved until now) freezes the
  // cube's SQL into the published dashboard, as before; checked publishes the cube itself, so a
  // viewer picks fields and filters in the dashboard and sees whatever the cube says that day.
  showInDashboard?: boolean;
  // Which of the cube's stories a live tile offers beside its field tree. Absent (every canvas
  // saved until now) offers none; `true` offers every story the cube's hints file holds; a list of
  // hint ids offers exactly those, in that order - which is how one dashboard about one country
  // offers the five stories that mean something there rather than all of the cube's. It travels
  // into the published `-cube-widgets.json` under the same one key, `showHints`.
  showHints?: boolean | string[];
}

export interface DataSource {
  mode: DataSourceMode;
  visualQuery?: VisualQuery;
  sql?: string;
  script?: string;
  generatedSql?: string;
  executeVersion?: number;
  scriptExecuteVersion?: number;
}

export interface WidgetDisplayConfig {
  [key: string]: unknown;
}

export interface Widget {
  id: string;
  type: WidgetType;
  gridPosition: { x: number; y: number; w: number; h: number };
  dataSource: DataSource | null;
  displayConfig: WidgetDisplayConfig;
  /** Raw column metadata — populated atomically with `shape` by
   *  `setWidgetQueryResult` (post-query) or `setWidgetColumnsFromSchema`
   *  (visual-mode pre-query schema fetch).  Every consumer reads from here
   *  rather than re-computing its own ColumnSchema[] array.  null during
   *  loading or when nothing has populated it yet. */
  columns: ColumnSchema[] | null;
  /** Classified dims+measures shape for widget-picker / sensibility / chart-
   *  ranking consumers.  Computed once in the store alongside `columns`, so
   *  classification (isCountry/isTemporalLike/etc.) runs once per query land
   *  rather than once per consumer render.  null when columns is null. */
  shape: PickShape | null;
}

/** Runtime cache of the latest QueryResult for each widget. Populated by
 *  useWidgetData after it executes the widget's query; read by ConfigPanel
 *  (column inference, palette/widget-type ranking) and by QueryBuilder
 *  (row-count status). Keeps the backend hit to one call per Run instead
 *  of every consumer fetching independently. Not serialized — transient
 *  per-session state, cleared on canvas load/reset. */
export interface WidgetQueryResult {
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
}

/** Single parameter definition — matches the rb-parameters web component
 *  contract. The canonical canvas-level Map is `{ parameters: ParamMeta[] }`
 *  stored at `CanvasState.parametersConfig`. The Groovy DSL text is derived
 *  on demand (DSL editor open → /serialize, publisher → /serialize). */
export interface ParamMeta {
  id: string;
  type: string;
  defaultValue?: unknown;
  constraints?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
  label?: string;
  description?: string;
}

export interface ParametersConfig {
  parameters: ParamMeta[];
}

export interface CanvasState {
  id: string;
  name: string;
  description: string;
  connectionId: string | null;
  widgets: Widget[];
  /** Per-widget query-result cache. See WidgetQueryResult. */
  queryResults: Record<string, WidgetQueryResult | undefined>;
  /** ============================================================================
   *  Canonical Map (Principle 4) for the dashboard-level Report-Parameters DSL.
   *  Replaces the prior `filterDsl: string`. The Map IS the storage; DSL text
   *  is a derived view (on demand: editor open → /serialize, publisher →
   *  /serialize). Form gestures in `FilterBarConfigPanel` mutate this Map
   *  directly. The DSL editor parses text → Map on save. Same Map flows to
   *  the canvas `<rb-parameters>` AND to the publisher (no drift possible).
   *  ============================================================================ */
  parametersConfig: ParametersConfig;
  filterValues: Record<string, string>;
  filterVersion: number;
  selectedWidgetId: string | null;
  editMode: boolean;
  /** The reportId of the last successful "Save to DataPallas" export.
   *  null = never exported. Lives in its own DB column (not serialized into
   *  the state JSON). Updated by the ExportDialog after a successful export. */
  exportedReportCode: string | null;
  // Associative exploration (activates when ≥1 filter-pane widget exists)
  exploreSelections: ExploreSelection[];
  exploreFieldStates: FieldStates;
  exploreVersion: number; // bumped on selection change — widgets watch this
}

// --- Default state for a new canvas ---

const DEFAULT_STATE: CanvasState = {
  id: "",
  name: "Untitled Canvas",
  description: "",
  connectionId: null,
  widgets: [],
  queryResults: {},
  parametersConfig: { parameters: [] },
  filterValues: {},
  filterVersion: 0,
  selectedWidgetId: null,
  editMode: true,
  exportedReportCode: null,
  exploreSelections: [],
  exploreFieldStates: {},
  exploreVersion: 0,
};

// --- Widget defaults ---

const WIDGET_DEFAULTS: Record<WidgetType, { w: number; h: number }> = {
  chart: { w: 6, h: 4 },
  tabulator: { w: 12, h: 4 },
  pivot: { w: 12, h: 5 },
  number: { w: 3, h: 2 },
  map: { w: 6, h: 5 },
  sankey: { w: 8, h: 5 },
  gauge: { w: 3, h: 3 },
  trend: { w: 3, h: 2 },
  progress: { w: 4, h: 2 },
  detail: { w: 4, h: 4 },
  text: { w: 6, h: 2 },
  divider: { w: 12, h: 1 },
  iframe: { w: 6, h: 4 },
  "filter-pane": { w: 3, h: 4 },
};

// --- Associative exploration types ---

export interface ExploreSelection {
  field: string;
  value: string;
}

export interface FieldStates {
  [field: string]: { associated: string[]; excluded: string[] };
}

// --- Store ---

interface CanvasActions {
  // Accepts a persisted canvas shape (without the runtime queryResults cache).
  // loadCanvas always resets queryResults to {} — the cache is per-session.
  loadCanvas: (canvas: Omit<CanvasState, "queryResults">) => void;
  resetCanvas: () => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setConnectionId: (connectionId: string | null) => void;
  addWidget: (type: WidgetType) => string;
  // `tableSchema` is passed ONLY for a table outside the connection's default
  // schema; see VisualQuery.tableSchema and `table-ref.ts`.
  addWidgetFromTable: (tableName: string, tableSchema?: string) => string;
  addWidgetFromCube: (cubeId: string) => string;
  changeWidgetRenderMode: (id: string, newType: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (id: string, position: { x: number; y: number; w: number; h: number }) => void;
  updateWidgetDataSource: (id: string, dataSource: DataSource) => void;
  updateWidgetDisplayConfig: (id: string, config: WidgetDisplayConfig) => void;
  /** Mark a widget's query as in-flight. Called by useWidgetData right
   *  before it executes the query/script. Keeps any previously cached
   *  `result` visible so consumers don't flicker to empty during refetch. */
  setWidgetQueryLoading: (widgetId: string) => void;
  /** Store a successful QueryResult. Overwrites previous result/error and
   *  clears loading. Called by useWidgetData (the single fetcher).  Also
   *  writes `widget.columns` + `widget.shape` — the classified view every
   *  downstream consumer reads from. */
  setWidgetQueryResult: (widgetId: string, result: QueryResult) => void;
  /** Store a fetch error. Clears previous result + loading. */
  setWidgetQueryError: (widgetId: string, error: string) => void;
  /** Flip loading → false without touching result/error. Called from
   *  useWidgetData's early-return paths (e.g. mode switched but the new
   *  mode has no SQL yet) so a stale `loading=true` from a previously
   *  in-flight query can't leave the Run button stuck in "Running…". */
  clearWidgetQueryLoading: (widgetId: string) => void;
  /** Pre-query path for visual mode: write classified columns + shape from
   *  a fetched table schema.  Called by ConfigPanel's schema-fetch effect
   *  when a widget is in visual mode with a picked table but before any
   *  query result has landed (so the palette / config panels have
   *  `widget.columns` and `widget.shape` to read from immediately).  The
   *  post-query path (`setWidgetQueryResult`) overwrites these later with
   *  the actual result's columns. */
  setWidgetColumnsFromSchema: (
    widgetId: string,
    columns: ColumnSchema[],
    tableSchema?: TableSchema | null,
    cardinality?: CardinalityMap,
  ) => void;
  selectWidget: (id: string | null) => void;
  setEditMode: (editMode: boolean) => void;
  updateLayout: (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  setParametersConfig: (next: ParametersConfig) => void;
  setFilterValue: (paramName: string, value: string) => void;
  /** Update the exportedReportCode after a successful "Save to DataPallas". */
  setExportedReportCode: (code: string | null) => void;
  // Associative exploration
  toggleExploreSelection: (field: string, value: string) => void;
  clearExploreSelections: () => void;
  setExploreFieldStates: (states: FieldStates) => void;
  isExploreActive: () => boolean; // true when ≥1 filter-pane widget exists
  getSerializableState: () => Omit<CanvasState, "selectedWidgetId" | "editMode" | "filterValues" | "filterVersion" | "exploreSelections" | "exploreFieldStates" | "exploreVersion" | "exportedReportCode" | "queryResults">;
}

/**
 * True while the store is written with what a query result (or a schema) says about a widget:
 * its columns, its shape and, until the user picks one, the chart type that fits. Those writes
 * follow from an edit that is already on the history; they are not one. The history reads this
 * to fold such a write into the snapshot it holds instead of recording a step, which would also
 * throw away everything that can still be redone.
 */
let derivedWrite = false;
export function isDerivedWrite(): boolean {
  return derivedWrite;
}

/** Runs a store write that is derived from what is already shown (an auto-pick, a default), not an edit by the user. */
export function asDerivedWrite(write: () => void): void {
  const before = derivedWrite;
  derivedWrite = true;
  try {
    write();
  } finally {
    derivedWrite = before;
  }
}

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  ...DEFAULT_STATE,

  loadCanvas: (canvas) => {
    // Clear the cross-mount widget execution dedup cache. Without this, SPA
    // navigations back to a previously-visited canvas reuse stale LAST_EXEC
    // entries (same widgetIds, same SQL, same filterSnapshot) → first effect
    // run after remount matches and SKIPs → no fetch fires → widgets render
    // blank until a hard refresh wipes module state.
    clearWidgetExecCache();
    set({ ...canvas, queryResults: {}, selectedWidgetId: null, editMode: true });
  },

  resetCanvas: () => set({ ...DEFAULT_STATE }),

  setName: (name) => set({ name }),

  setDescription: (description) => set({ description }),

  setConnectionId: (connectionId) => set({ connectionId }),

  addWidget: (type) => {
    const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const defaults = WIDGET_DEFAULTS[type];
    const widgets = get().widgets;

    // Find the lowest available y position
    let maxY = 0;
    for (const w of widgets) {
      const bottom = w.gridPosition.y + w.gridPosition.h;
      if (bottom > maxY) maxY = bottom;
    }

    const widget: Widget = {
      id,
      type,
      gridPosition: { x: 0, y: maxY, ...defaults },
      dataSource: null,
      displayConfig: {},
      columns: null,
      shape: null,
    };

    set({ widgets: [...widgets, widget], selectedWidgetId: id });
    return id;
  },

  // Data-first: create a widget pre-wired to a table. Default render mode is
  // Data Table — start with raw rows; the user switches via "Visualize as".
  addWidgetFromTable: (tableName, tableSchema) => {
    const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const defaults = WIDGET_DEFAULTS.tabulator;
    const widgets = get().widgets;
    let maxY = 0;
    for (const w of widgets) {
      const bottom = w.gridPosition.y + w.gridPosition.h;
      if (bottom > maxY) maxY = bottom;
    }
    const widget: Widget = {
      id,
      type: "tabulator",
      gridPosition: { x: 0, y: maxY, ...defaults },
      dataSource: {
        mode: "visual",
        visualQuery: {
          kind: "table",
          table: tableName,
          // Spread so a default-schema table has no `tableSchema` key at all and
          // serializes byte-for-byte as it did before schemas were reported.
          ...(tableSchema ? { tableSchema } : {}),
          filters: [],
          summarize: [],
          groupBy: [],
          sort: [],
          limit: 500,
        },
      },
      // Drop-default type (tabulator for tables).  The widget auto-migrates
      // to the best-fit type (number / chart / map / ...) on the FIRST
      // successful query result — handled imperatively in
      // setWidgetQueryResult below, not via any reactive effect.  Any
      // explicit palette click sets `userPicked: true` which pins the type
      // forever.  Matches the "display-auto on first question run"
      // behaviour without any loop potential.
      displayConfig: {},
      columns: null,
      shape: null,
    };
    set({ widgets: [...widgets, widget], selectedWidgetId: id });
    return id;
  },

  // Data-first: create a widget pre-wired to a cube. Default render mode is Pivot
  // (cubes are usually crosstab-shaped); user can change via "Visualize as".
  addWidgetFromCube: (cubeId) => {
    const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const defaults = WIDGET_DEFAULTS.pivot;
    const widgets = get().widgets;
    let maxY = 0;
    for (const w of widgets) {
      const bottom = w.gridPosition.y + w.gridPosition.h;
      if (bottom > maxY) maxY = bottom;
    }
    const widget: Widget = {
      id,
      type: "pivot",
      gridPosition: { x: 0, y: maxY, ...defaults },
      dataSource: {
        mode: "visual",
        visualQuery: {
          kind: "cube",
          cubeId,
          table: "",
          filters: [],
          summarize: [],
          groupBy: [],
          sort: [],
          limit: 500,
        },
      },
      // See addWidgetFromTable — cube drops default to "pivot" and auto-
      // migrate on first successful query result via setWidgetQueryResult.
      displayConfig: {},
      columns: null,
      shape: null,
    };
    set({ widgets: [...widgets, widget], selectedWidgetId: id });
    return id;
  },

  // Switch a widget's render mode while preserving its dataSource + displayConfig.
  // Used by the "Visualize as" dropdown. Grid size adjusts to the new type's defaults
  // only when the current size matches the old type's defaults (so user-resized widgets
  // keep their size).
  changeWidgetRenderMode: (id, newType) => {
    const widgets = get().widgets;
    const widget = widgets.find((w) => w.id === id);
    console.log('[changeRenderMode] id=' + id + ' newType=' + newType + ' prevType=' + (widget?.type ?? 'none'));
    if (!widget || widget.type === newType) return;
    const oldDefaults = WIDGET_DEFAULTS[widget.type];
    const newDefaults = WIDGET_DEFAULTS[newType];
    const isDefaultSize = widget.gridPosition.w === oldDefaults.w && widget.gridPosition.h === oldDefaults.h;
    const gridPosition = isDefaultSize
      ? { ...widget.gridPosition, w: newDefaults.w, h: newDefaults.h }
      : widget.gridPosition;
    set({
      widgets: widgets.map((w) => (w.id === id ? { ...w, type: newType, gridPosition } : w)),
    });
  },

  removeWidget: (id) => {
    const state = get();
    const nextQueryResults = { ...state.queryResults };
    delete nextQueryResults[id];
    set({
      widgets: state.widgets.filter((w) => w.id !== id),
      queryResults: nextQueryResults,
      selectedWidgetId: state.selectedWidgetId === id ? null : state.selectedWidgetId,
    });
  },

  updateWidgetPosition: (id, position) => {
    set({
      widgets: get().widgets.map((w) => (w.id === id ? { ...w, gridPosition: position } : w)),
    });
  },

  updateWidgetDataSource: (id, dataSource) => {
    set({
      widgets: get().widgets.map((w) => (w.id === id ? { ...w, dataSource } : w)),
    });
  },

  updateWidgetDisplayConfig: (id, config) => {
    set({
      widgets: get().widgets.map((w) => (w.id === id ? { ...w, displayConfig: config } : w)),
    });
  },

  setWidgetQueryLoading: (widgetId) => {
    const state = get();
    const prev = state.queryResults[widgetId];
    // Preserve any existing result so consumers don't blank out mid-refetch.
    set({
      queryResults: {
        ...state.queryResults,
        [widgetId]: { result: prev?.result ?? null, error: null, loading: true },
      },
    });
  },

  setWidgetQueryResult: (widgetId, result) => {
    const state = get();
    const widget = state.widgets.find((w) => w.id === widgetId);
    if (!widget) {
      // Widget was removed between query launch and result land — still cache
      // the result so any stragglers can read it.
      set({
        queryResults: { ...state.queryResults, [widgetId]: { result, error: null, loading: false } },
      });
      return;
    }

    // STEP 1 — classify ONCE.  `computeWidgetShape` runs the full
    // inferColumnsFromRow + shapeFromResult pipeline.  The resulting
    // `columns` + `shape` are written onto the widget record below and
    // become the single source of truth for every downstream consumer
    // (ConfigPanel palette, MapConfig, TrendConfig, widget-sensibility,
    // ChartWidget's shape-aware rendering).  Before this refactor each
    // consumer rebuilt its own ColumnSchema[] from its own source — races
    // and drift followed.  After this: one computation, one cache.
    const computed = computeWidgetShape(result, widget.dataSource);
    if (computed) {
      // [SQL-TRACE] diagnostic — leave commented; uncomment to debug the
      // engine's input: dim kinds, measure names, rowCount as observed by
      // pickWidget. Useful when palette/auto-pick output looks wrong.
      // const colTypes = computed.columns.map(c => c.columnName + ':' + c.typeName).join(',');
      // const dimKinds = computed.shape.dims.map(d => d.name + ':' + d.kind).join(',');
      // const measureNames = computed.shape.measures.map(m => m.name).join(',');
      // console.log(
      //   '[SQL-TRACE setWidgetQueryResult] widgetId=' + widgetId +
      //   ' resultRows=' + (result.data?.length ?? 0) +
      //   ' resultRowCount=' + result.rowCount +
      //   ' cols=[' + colTypes + ']' +
      //   ' dims=[' + dimKinds + ']' +
      //   ' measures=[' + measureNames + ']',
      // );
    }

    // STEP 2 — auto-switch.  Mirrors the standard model: every query result
    // gets `defaultDisplay()` applied as long as the user hasn't pinned a
    // choice AND the pick is either a migration away from the drop-default
    // (tabulator/pivot) OR a genuine change of best-fit type.  Loop-safe:
    //  - `userPicked: true` permanently disables this path.
    //  - once widget.type === pick.best and !isAtDropDefault, no re-write.
    //  - atomic set() below publishes widget + queryResult together.
    const userHasPicked = !!widget.displayConfig.userPicked;
    const isAtDropDefault = widget.type === "tabulator" || widget.type === "pivot";

    let nextType = widget.type;
    let nextDisplayConfig = widget.displayConfig;

    if (computed && !userHasPicked) {
      const vq = widget.dataSource?.mode === "visual" ? widget.dataSource.visualQuery : undefined;
      const isAggregated = vq
        ? (vq.kind === "cube" || (vq.summarize?.length ?? 0) > 0 || (vq.groupBy?.length ?? 0) > 0)
        : undefined;
      const auto = resolveAutoWidget(computed.shape, result.rowCount, isAggregated);
      if (isAtDropDefault || auto.type !== widget.type) {
        // Layer the two seeds: the type-specific helper (pickMapDefaults,
        // pickTrendFields, etc.) first, then pickWidget's per-rule
        // displayConfig (authoritative — Rule 4 already knows which region).
        const basePatch = seedDisplayConfigForType(
          auto.type,
          widget.displayConfig,
          computed.columns,
          { cardinality: {}, extractions: new Set() },
          computed.shape,
        );
        nextType = auto.type;
        nextDisplayConfig = {
          ...widget.displayConfig,
          ...(basePatch ?? {}),
          ...(auto.displayConfig ?? {}),
        };
      }
    }

    console.log('[setQR-final] widgetId=' + widgetId + ' type=' + nextType +
      ' prevType=' + widget.type + ' userPicked=' + userHasPicked +
      ' autoSwitched=' + (nextType !== widget.type) +
      ' dc.dateField=' + (nextDisplayConfig.dateField ?? 'none') +
      ' dc.keys=' + Object.keys(nextDisplayConfig).join(','));

    // STEP 3 — atomic write.  One set() publishes type, displayConfig,
    // columns, shape, and the queryResult cache together.  No half-state
    // visible to reactive observers.  What this writes is derived from the
    // result, not an edit by the user, and is marked so (see isDerivedWrite).
    derivedWrite = true;
    try {
      set({
        widgets: state.widgets.map((w) =>
          w.id === widgetId
            ? {
                ...w,
                type: nextType,
                displayConfig: nextDisplayConfig,
                columns: computed?.columns ?? w.columns,
                shape: computed?.shape ?? w.shape,
              }
            : w
        ),
        queryResults: {
          ...state.queryResults,
          [widgetId]: { result, error: null, loading: false },
        },
      });
    } finally {
      derivedWrite = false;
    }
  },

  setWidgetColumnsFromSchema: (widgetId, columns, tableSchema, cardinality) => {
    // Pre-query classification for visual mode.  Runs shapeFromColumns once;
    // every consumer reads widget.columns + widget.shape from here onwards.
    // Overwritten later by setWidgetQueryResult when the query actually runs.
    const shape = shapeFromColumns(columns, tableSchema ?? undefined, cardinality);
    derivedWrite = true;
    try {
      set({
        widgets: get().widgets.map((w) =>
          w.id === widgetId ? { ...w, columns, shape } : w
        ),
      });
    } finally {
      derivedWrite = false;
    }
  },

  setWidgetQueryError: (widgetId, error) => {
    set({
      queryResults: {
        ...get().queryResults,
        [widgetId]: { result: null, error, loading: false },
      },
    });
  },

  clearWidgetQueryLoading: (widgetId) => {
    const state = get();
    const prev = state.queryResults[widgetId];
    if (!prev || prev.loading === false) return;
    set({
      queryResults: {
        ...state.queryResults,
        [widgetId]: { ...prev, loading: false },
      },
    });
  },

  selectWidget: (id) => set({ selectedWidgetId: id }),

  setEditMode: (editMode) => set({ editMode }),

  updateLayout: (layouts) => {
    set({
      widgets: get().widgets.map((w) => {
        const layout = layouts.find((l) => l.i === w.id);
        if (layout) {
          return { ...w, gridPosition: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } };
        }
        return w;
      }),
    });
  },

  setParametersConfig: (next) => {
    set({ parametersConfig: next });
  },

  setExportedReportCode: (code) => set({ exportedReportCode: code }),

  setFilterValue: (paramName, value) => {
    const state = get();
    // Idempotent: skip when the value is already what's in the store. Echo
    // events from <rb-parameters> can re-fire valueChange on init/re-render
    // with the same value — without this guard each echo would bump
    // filterVersion, cascade through every useWidgetData, cancel its
    // in-flight fetch, and strand widgets in a permanent loading state.
    if (state.filterValues[paramName] === value) return;
    set({
      filterValues: { ...state.filterValues, [paramName]: value },
      filterVersion: state.filterVersion + 1,
    });
  },

  toggleExploreSelection: (field, value) => {
    const state = get();
    const exists = state.exploreSelections.find((s) => s.field === field && s.value === value);
    const next = exists
      ? state.exploreSelections.filter((s) => !(s.field === field && s.value === value))
      : [...state.exploreSelections, { field, value }];
    set({ exploreSelections: next, exploreVersion: state.exploreVersion + 1 });
  },

  clearExploreSelections: () => {
    set({ exploreSelections: [], exploreFieldStates: {}, exploreVersion: get().exploreVersion + 1 });
  },

  setExploreFieldStates: (states) => {
    set({ exploreFieldStates: states });
  },

  isExploreActive: () => {
    return get().widgets.some((w) => w.type === "filter-pane");
  },

  getSerializableState: () => {
    // queryResults is transient per-session cache — strip it along with the
    // other non-serializable runtime fields.
    const { selectedWidgetId, editMode, filterValues, filterVersion, exploreSelections, exploreFieldStates, exploreVersion, exportedReportCode, queryResults, ...rest } = get();
    // Strip store actions — only keep data properties
    const { loadCanvas, resetCanvas, setName, setDescription, setConnectionId, addWidget, addWidgetFromTable, addWidgetFromCube, changeWidgetRenderMode, removeWidget, updateWidgetPosition, updateWidgetDataSource, updateWidgetDisplayConfig, setWidgetQueryLoading, setWidgetQueryResult, setWidgetQueryError, selectWidget, setEditMode, updateLayout, setParametersConfig, setFilterValue, setExportedReportCode, toggleExploreSelection, clearExploreSelections, setExploreFieldStates, isExploreActive, getSerializableState, ...state } = rest as CanvasState & CanvasActions;
    return state;
  },
}));

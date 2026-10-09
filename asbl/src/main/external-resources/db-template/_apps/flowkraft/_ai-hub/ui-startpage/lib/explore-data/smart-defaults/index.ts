// Smart defaults — barrel file. Re-exports every public function so consumers
// can import from the folder root:
//   import { autoSummarize, defaultDisplay } from "@/lib/explore-data/smart-defaults"
//
// ─── SINGLE TRUTH — read before adding a local classifier/auto-pick ────────
// Every "is this column X?" question has ONE authoritative predicate, exported
// from `./classification`.  Shape-building, widget-picker, config-panel option
// filters, chart-ranking — all compose the same predicate.  Do NOT inline a
// regex, copy a rule, or write a near-duplicate "just for this component".
// If a rule needs changing, change the predicate in classification.ts.  See
// the full rationale + historical breakage list at the top of classification.ts.
// ───────────────────────────────────────────────────────────────────────────

export {
  // Kinds + constants
  type ColumnKind,
  type CardinalityMap,
  CATEGORY_LOW_MAX,
  NUMERIC_TYPES,
  TEMPORAL_TYPES,
  BOOLEAN_TYPES,
  TEXT_FREE_TYPES,
  normalizeType,
  // ID / PK / FK
  isIdColumn,
  isPK,
  isFK,
  // Semantic-type predicates (Phase A — expanded set)
  isState,
  isCountry,
  isLatitude,
  isLongitude,
  isCoordinate,
  hasLatLonColumns,
  isAddress,
  isLocation,
  isTemporalByName,
  isTemporalLike,
  TEMPORAL_NAME_PATTERN,
  isEmail,
  isURL,
  isImageURL,
  isAvatarURL,
  isName,
  isTitle,
  isDescription,
  isComment,
  isCurrency,
  isPercentage,
  isQuantity,
  isScore,
  isDuration,
  isNumeric,
  isTemporal,
  isBooleanCol,
  isText,
  // Classification
  classifyColumn,
  classifyTable,
  looksLikeBoolean,
} from "./classification";

export {
  guessTimeBucket,
  nicerBinWidth,
  isTemporalExtraction,
} from "./buckets";

export {
  probeCardinality,
  probeDateRange,
  probeNumericRange,
  probeSemanticType,
} from "./probes";

export {
  TOP_N_DEFAULT,
  CHART_PALETTE,
  colorForDataset,
  clipTopN,
  sortBarsDesc,
  shouldShowLegend,
} from "./rendering";

export {
  autoSummarize,
  autoPickMeasure,
  autoFilterPaneField,
  autoPivotLayout,
  MAX_PIVOT_CELLS,
  suggestRenderModeForCube,
  type PivotLayout,
} from "./auto-pick";

export {
  type SummarizeShape,
  type DisplayDecision,
  defaultDisplay,
  shapeFromResult,
  enforceChartTypeLimits,
} from "./display";

export {
  type ChartSensibility,
  isSensibleChartSubtype,
} from "./chart-sensibility";

export {
  type ChartRankingHints,
  rankChartSubtypes,
} from "./chart-ranking";

export {
  type AxisAssignment,
  type AxisAssignmentHints,
  MAX_SERIES,
  pickDefaultAxes,
  canReuseAxisPicks,
  splitDimsAndMeasures,
} from "./axis-assignment";

export {
  SANKEY_MAX_TARGET_CARDINALITY,
  type Row2Hints,
  type MapDefaults,
  pickSankeyFields,
  pickGaugeField,
  pickTrendFields,
  pickProgressField,
  pickDetailDefaults,
  pickMapDefaults,
  pickProgressGoal,
} from "./row2-auto-pick";

export {
  type WidgetSensibility,
  type SensibilityHints,
  type SensibilityGroups,
  isSensibleWidget,
  groupWidgetsByShape,
  groupWidgetsBySensibility,
} from "./widget-sensibility";

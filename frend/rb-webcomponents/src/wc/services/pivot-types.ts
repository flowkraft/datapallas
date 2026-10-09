/**
 * TypeScript interfaces for PivotTable - matching react-pivottable API
 */

// Aggregator function type
export interface Aggregator {
  (data?: any, rowKey?: string[], colKey?: string[]): AggregatorInstance;
}

export interface AggregatorInstance {
  push(record: Record<string, any>): void;
  value(): number | string | null;
  format(x: any): string;
  numInputs?: number;
  // Allow arbitrary state properties (count, sum, uniq, vals, etc.)
  [key: string]: any;
}

export interface AggregatorFactory {
  (attrs: string[]): Aggregator;
  (...attrs: any[]): Aggregator;
}

// Sorter function type
export type Sorter = (a: any, b: any) => number;
export type SorterFactory = (attr: string) => Sorter;
export type Sorters = Record<string, Sorter> | SorterFactory;

// Derived attribute function
export type DerivedAttributeFn = (record: Record<string, any>) => any;

// Value filter: { attrName: { value1: true, value2: true } }
export type ValueFilter = Record<string, Record<string, boolean>>;

// Sort order options
export type SortOrder = 'key_a_to_z' | 'key_z_to_a' | 'value_a_to_z' | 'value_z_to_a';

// Renderer names
export type RendererName = 
  | 'Table'
  | 'Table Heatmap'
  | 'Table Col Heatmap'
  | 'Table Row Heatmap'
  | 'Grouped Column Chart'
  | 'Stacked Column Chart'
  | 'Grouped Bar Chart'
  | 'Stacked Bar Chart'
  | 'Line Chart'
  | 'Dot Chart'
  | 'Area Chart'
  | 'Scatter Chart'
  | 'Pie Chart'
  | 'Doughnut Chart';

// PivotData constructor props
export interface PivotDataProps {
  data?: Record<string, any>[] | any[][] | ((callback: (record: Record<string, any>) => void) => void);
  aggregators?: Record<string, AggregatorFactory>;
  aggregatorName?: string;
  cols?: string[];
  rows?: string[];
  vals?: string[];
  valueFilter?: ValueFilter;
  sorters?: Sorters;
  derivedAttributes?: Record<string, DerivedAttributeFn>;
  rowOrder?: SortOrder;
  colOrder?: SortOrder;
}

// Table click callback type
export type TableClickCallback = (
  e: MouseEvent,
  value: any,
  filters: Record<string, any>,
  pivotData: PivotData
) => void;

// Processing engine type
// - 'browser': Client-side processing (explicit, for non-OLAP databases)
// - 'duckdb': Server-side processing using DuckDB (explicit)
// - 'clickhouse': Server-side processing using ClickHouse (explicit)
// - undefined: Auto-detect from connection database type (backend decides)
export type PivotEngine = 'browser' | 'duckdb' | 'clickhouse';

// PivotTableUI component props (extends PivotDataProps)
export interface PivotTableProps extends PivotDataProps {
  rendererName?: RendererName | string;
  hiddenAttributes?: string[];
  hiddenFromAggregators?: string[];
  hiddenFromDragDrop?: string[];
  unusedOrientationCutoff?: number;
  menuLimit?: number;
  tableClickCallback?: TableClickCallback;
  onChange?: (state: PivotTableState) => void;
  // Server-side processing options
  engine?: PivotEngine;      // Optional - if omitted, auto-detected from connection type
  connectionCode?: string;   // Required for server-side processing
  tableName?: string;        // Required for server-side processing
}

// State object passed to onChange callback
export interface PivotTableState {
  rows: string[];
  cols: string[];
  vals: string[];
  aggregatorName: string;
  rendererName: string;
  valueFilter: ValueFilter;
  rowOrder: SortOrder;
  colOrder: SortOrder;
}

// Number format options
export interface NumberFormatOptions {
  digitsAfterDecimal?: number;
  scaler?: number;
  thousandsSep?: string;
  decimalSep?: string;
  prefix?: string;
  suffix?: string;
}

// Locale strings
export interface LocaleStrings {
  renderError: string;
  computeError: string;
  uiRenderError: string;
  selectAll: string;
  selectNone: string;
  tooMany: string;
  filterResults: string;
  apply: string;
  cancel: string;
  totals: string;
  vs: string;
  by: string;
}

// Locale definition
export interface Locale {
  aggregators: Record<string, AggregatorFactory>;
  localeStrings: LocaleStrings;
}

// Table options for click callback
export interface TableOptions {
  clickCallback?: (
    e: MouseEvent,
    value: any,
    filters: Record<string, any>,
    pivotData: PivotData
  ) => void;
}

// Heatmap mode
export type HeatmapMode = 'full' | 'row' | 'col';

// Forward declaration for PivotData class
export interface PivotData {
  props: PivotDataProps;
  getRowKeys(): string[][];
  getColKeys(): string[][];
  getAggregator(rowKey: string[], colKey: string[]): AggregatorInstance;
  filter(record: Record<string, any>): boolean;
  forEachMatchingRecord(criteria: Record<string, any>, callback: (record: Record<string, any>) => void): void;
}

// Chart.js integration - transform pivot data to Chart.js format
export interface ChartJSData {
  labels: string[];
  datasets: ChartJSDataset[];
}

export interface ChartJSDataset {
  label: string;
  data: (number | null)[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  type?: string;
}

// Renderer type
export type Renderer = (props: PivotTableProps & { pivotData: PivotData }) => any;

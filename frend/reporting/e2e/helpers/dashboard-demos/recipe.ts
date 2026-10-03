// ═══════════════════════════════════════════════════════════════════════════════
// recipe.ts
// What a Canvas user does to rebuild a Dashboard Demo: the types (section 9.3).
//
// A RECIPE IS DATA
//
// `{id, steps}` and nothing else: no Playwright call, no selector. Each step is one thing a person
// means to do ("pick the orders table", "sum total_amount", "show it as a line chart"), and
// `recipe-runner.ts` is the only place that knows which controls do it. So the same recipe is run
// by `canvas-dashboard-demos.spec.ts`, photographed step by step for the "How it was built" pages
// (section 9.6: `shot`), and compared with the canvas that ships by `canvas-parity.ts`.
//
// A WIDGET IS A RUN OF STEPS
//
// It starts with a step that puts something on the canvas (`pickTable`, `pickCube`, `addElement`)
// and goes on with the steps that shape it. Every step after the first acts on the widget the
// last one put there, the way the right-hand panel does.
// ═══════════════════════════════════════════════════════════════════════════════

import type { WidgetType } from '../explore-data-test-helper';

/** A rectangle on the canvas' 12-column grid, in grid units. */
export interface Grid { x: number; y: number; w: number; h: number }

/**
 * The picture a step leaves for its "How it was built" page (section 9.6). Phase D takes it; a
 * recipe without `shot`s is complete and runs the same.
 */
export interface Shot {
  title: string;
  caption: string;
  /** The id of the control the step used, ringed in the picture. */
  highlight?: string;
  /** SQL or script the reader can copy. */
  code?: string;
}

/** One filter row of the Visual query, in the words the Filter step uses. */
export interface VisualFilter {
  column: string;
  operator: string;
  /** A literal, or `${name}` to bind the row to a dashboard filter. */
  value?: string;
  /** The upper box of a `between`. */
  valueTo?: string;
}

/** One Summarize row. */
export interface VisualAggregate {
  aggregation: string;
  field: string;
  /** Read as a % of the whole result. */
  share?: boolean;
}

/** One sort row. */
/** `asc` / `desc` are how two shipped canvases write it; the Sort step stores upper case. */
export interface VisualSort { column: string; direction: 'ASC' | 'DESC' | 'asc' | 'desc' }

/** One computed column of the Visual query: one arithmetic step over two operands. */
export interface VisualComputed { name: string; left: string; operator: '+' | '-' | '*' | '/'; right: string }

/** What the Visual query builder is told. */
export interface VisualQuerySpec {
  computed?: VisualComputed[];
  filters?: VisualFilter[];
  /** Whether a row must pass all the filters or any one. */
  match?: 'all' | 'any';
  summarize?: VisualAggregate[];
  groupBy?: string[];
  /** The time bucket of each grouped date column. */
  buckets?: Record<string, string>;
  sort?: VisualSort[];
  limit?: number;
}

/** One tick-box row of a cube: a dimension, measure or segment. */
export interface CubeSpec {
  dimensions: string[];
  measures: string[];
  segments?: string[];
  /** The time grain picked for a time dimension. */
  granularities?: Record<string, string>;
  /** A filter written on the cube, not bound to a dashboard filter. */
  filters?: Array<{ member: string; operator: string; values: string[] }>;
  order?: Array<{ member: string; dir: 'asc' | 'desc' }>;
  limit?: number | null;
  /** The dashboard filters the cube's members are bound to. */
  bindings?: Array<{ param: string; paramTo?: string; member: string; operator: string }>;
}

/** One filter of the dashboard's filter bar, as the dialog stores it. */
export interface FilterParam {
  id: string;
  type?: string;
  label?: string;
  defaultValue?: unknown;
  constraints?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
}

/** The display settings a widget type has, written as the widget stores them. */
export type DisplayConfig = Record<string, unknown>;

export type Step =
  /** The dashboard's filter bar, through the filters dialog: its form, or the dialog's own DSL pane. */
  | ({ kind: 'filters'; via: 'form' | 'dsl'; params: FilterParam[]; dsl?: string } & StepBase)
  /** A Text block or a Divider from the Elements tab. */
  | ({ kind: 'addElement'; element: 'text' | 'divider'; key: string; text?: string; grid: Grid } & StepBase)
  /** A table from the schema browser: a new widget bound to it. `table` is the browser's key (`dash_demo.orders`). */
  | ({ kind: 'pickTable'; key: string; table: string; grid: Grid } & StepBase)
  /** A cube from the schema browser: a new widget bound to it. */
  | ({ kind: 'pickCube'; key: string; cubeId: string; grid: Grid } & StepBase)
  /** The Visual tab of the current widget. */
  | ({ kind: 'visualQuery'; query: VisualQuerySpec } & StepBase)
  /** The cube's tick-boxes, granularity, order, limit and bindings of the current widget. */
  | ({ kind: 'cubeFields'; cube: CubeSpec } & StepBase)
  /** Finetune → SQL. */
  | ({ kind: 'sql'; sql: string } & StepBase)
  /** Finetune → Script. */
  | ({ kind: 'script'; script: string } & StepBase)
  /** The "Visualize as" choice of the current widget. */
  | ({ kind: 'visualizeAs'; widget: WidgetType } & StepBase)
  /** The Display tab of the current widget; `dsl` is the widget's DSL, for what the pickers cannot say. */
  | ({ kind: 'displayConfig'; widget: WidgetType; config: DisplayConfig; dsl?: string } & StepBase)
  /** Every widget dragged and resized to its place. */
  | ({ kind: 'layout'; grids: Grid[] } & StepBase)
  /** Publish, and read the report id back. */
  | ({ kind: 'publish' } & StepBase);

interface StepBase { shot?: Shot }

export interface Recipe {
  /** The demo's id, `dd-sales-overview`. */
  id: string;
  /** Its number in the Gallery. */
  nn: number;
  /** The canvas' name. */
  title: string;
  steps: Step[];
}

import type { CubeParamBinding, CubeSelection, WidgetType } from "@/lib/stores/canvas-store";
import { bindingTakesTwoEnds, cubeQueryOperator } from "./filter-operators";
import { paramRefOf } from "./sql-builder";
import type { ColumnSettings, ColumnSettingsMap } from "./column-settings";

/**
 * What a cube's field tree says, in the canvas's own words.
 *
 * Both hosts of `<rb-cube-renderer>` read one tree the same way: the right panel's picker
 * (`VisualQueryBuilder`) and, for a widget with `showInDashboard`, the cube on the canvas
 * (`CubeRendererWidget`). What differs is where each writes the answer — the data source it is
 * editing, or the widget it is — never how the answer is read.
 */

/** The detail of the component's `selectionChanged`. */
export interface CubeSelectionDetail {
  selectedDimensions?: string[];
  selectedMeasures?: string[];
  selectedSegments?: string[];
  selectedFilters?: CubeSelection["filters"];
  granularities?: Record<string, string>;
  selectedOrder?: CubeSelection["order"];
  selectedLimit?: number | null;
  cubeName?: string;
}

/**
 * The whole question the tree is asking, in one place: it is saved on the widget, it is what
 * generate-sql is asked with, and for a shown cube it is the selection the dashboard opens with.
 * Anything the tree does not say is empty here rather than absent, so a saved canvas and a fresh
 * one have the same shape. An empty tree is not a question, and answers `null`.
 */
export function selectionOfEvent(event: Event): { selection: CubeSelection; cubeName: string } | null {
  const detail = (event as CustomEvent<CubeSelectionDetail>).detail || {};
  const selection: CubeSelection = {
    dimensions: detail.selectedDimensions || [],
    measures: detail.selectedMeasures || [],
    segments: detail.selectedSegments || [],
    filters: detail.selectedFilters || [],
    granularities: detail.granularities || {},
    order: detail.selectedOrder || [],
    limit: detail.selectedLimit ?? null,
  };
  if (!selection.dimensions.length && !selection.measures.length) return null;
  return { selection, cubeName: detail.cubeName || "" };
}

/** The shape a widget type asks a shown cube to draw its answer in (W3, and the exporter's own
 *  rule for `display` in `<reportId>-cube-widgets.json`). */
export function cubeDisplayOf(type: WidgetType | undefined): string {
  if (type === "number") return "value";
  if (type === "chart") return "chart";
  return "table";
}

/** The dimensions of a cube, in the order its file writes them: what the bind chip offers as
 *  the member a dashboard parameter can narrow. A cube with none offers none. */
export function cubeDimensionNames(config: unknown, cubeName: string): string[] {
  const cube = cubeInFile(config, cubeName);
  const declared = (cube?.dimensions as { name?: string }[] | undefined) ?? [];
  return declared.map((dimension) => String(dimension?.name ?? "")).filter((name) => name !== "");
}

/** A member a dashboard parameter can narrow: what it is called, what it is, and whether it is
 *  a measure - which makes its filter a HAVING rather than a WHERE. */
export interface CubeBindableMember {
  name: string;
  /** The cube's own type word (`string`, `number`, `time`, `boolean`, `geo`); '' when it says none. */
  type: string;
  measure: boolean;
}

/**
 * Everything of a cube a dashboard filter can narrow: its dimensions and its measures, each in
 * the order the file writes them (owner, 2026-09-28).
 *
 * A measure is bindable because "only the categories above what the viewer typed" is the same
 * question as "only Germany", asked of the total instead of the row - the generator already
 * writes a measure filter as a HAVING, frozen and live.
 */
export function cubeBindableMembers(config: unknown, cubeName: string): CubeBindableMember[] {
  const cube = cubeInFile(config, cubeName);
  const read = (declared: unknown, measure: boolean): CubeBindableMember[] =>
    ((declared as { name?: string; type?: string }[] | undefined) ?? [])
      .map((member) => ({
        name: String(member?.name ?? ""),
        type: String(member?.type ?? ""),
        measure,
      }))
      .filter((member) => member.name !== "");
  return [...read(cube?.dimensions, false), ...read(cube?.measures, true)];
}

/** The operator a binding that names none is read with: a list, because that is the form a
 *  dashboard's own "All" travels in - `IN (${country})` with `*` in it is every row, and with
 *  nothing in it the line is left out altogether (SqlParameterLines). */
export const DEFAULT_BINDING_OPERATOR = "in";

/**
 * The author's bindings as the filters the generator writes `${country}` from.
 *
 * The value is the parameter's name, not a value: nobody has answered anything on the canvas, and
 * `CubeSqlGenerator` leaves such a name standing exactly as it leaves a cube's own `${dp_...}`
 * standing. So the SQL the canvas freezes is already the export form the published dashboard
 * binds at run time.
 *
 * A half-written binding is not a filter: one with no parameter, no member, or an operator that
 * has no cube form contributes nothing rather than a filter the cube would refuse.
 */
export function bindingsAsFilters(bindings: CubeParamBinding[] | undefined): CubeSelection["filters"] {
  const filters: CubeSelection["filters"] = [];
  for (const binding of bindings ?? []) {
    const param = String(binding?.param ?? "").trim();
    const member = String(binding?.member ?? "").trim();
    if (!param || !member) continue;
    const chip = String(binding?.operator ?? DEFAULT_BINDING_OPERATOR);
    const operator = cubeQueryOperator(chip);
    if (!operator) continue;
    if (bindingTakesTwoEnds(chip)) {
      // Two parameters, one per end, as the table chip binds a date range (F8). One end missing
      // is a half-written binding, and a half-written binding is not a filter.
      const paramTo = String(binding?.paramTo ?? "").trim();
      if (!paramTo) continue;
      filters.push({ member, operator, values: [paramRefOf(param), paramRefOf(paramTo)] });
      continue;
    }
    filters.push({ member, operator, values: [paramRefOf(param)] });
  }
  return filters;
}

/**
 * The selection generate-sql is asked with: the question the tree asks, and the author's bindings
 * after it. The bindings are kept apart on the widget (`paramBindings`) and only joined here, so
 * reopening the widget puts the author's own chips back into the tree and no parameter name ever
 * appears there as if a viewer had typed it.
 *
 * Returns the selection itself when there is nothing to add, so the ordinary widget generates the
 * SQL it always did.
 */
export function selectionWithBindings(
  selection: CubeSelection,
  bindings?: CubeParamBinding[],
): CubeSelection {
  const asFilters = bindingsAsFilters(bindings ?? selection.paramBindings);
  if (!asFilters.length) return selection;
  return { ...selection, filters: [...(selection.filters ?? []), ...asFilters] };
}

/** The currency a cube that names none is read in (W4.2). */
export const DEFAULT_CUBE_CURRENCY = "USD";

/** The cube of a parsed file: the unnamed one is the file itself, a named one sits under
 *  `namedOptions`. The same rule `<rb-cube-renderer>` reads a file by, so a widget and the tree
 *  beside it never disagree about which cube they are looking at. */
export function cubeInFile(config: unknown, cubeName: string): Record<string, unknown> | null {
  const file = config as Record<string, unknown> | null;
  if (!file) return null;
  if (!cubeName) return file;
  const named = file.namedOptions as Record<string, Record<string, unknown>> | undefined;
  return named?.[cubeName] ?? file;
}

/** What a measure's declared `format` means to the widget that shows it. `percent` expects a
 *  fraction (0.34 → 34%), which is the rule `formatPercentageValue` already follows. */
function settingsOfFormat(format: string, currency: string): ColumnSettings | null {
  switch (format) {
    case "currency": return { numberStyle: "currency", currency };
    case "percent":  return { numberStyle: "percent" };
    case "number":   return { numberStyle: "decimal" };
    default:         return null;
  }
}

/**
 * The cube's declared formats as the widget's own column formats (W4.2): a measure the model says
 * is money is money in the table under it, without the author setting anything.
 *
 * It only ever seeds — a column the author has already settled keeps their setting, and a measure
 * the cube says nothing about is left to the auto-picker. Returns the new map, or `null` when
 * there is nothing to add, so a caller writes to the store only when something changed.
 */
export function seedCubeColumnFormats(
  config: unknown,
  cubeName: string,
  measures: string[],
  existing: ColumnSettingsMap | undefined,
): ColumnSettingsMap | null {
  const cube = cubeInFile(config, cubeName);
  if (!cube) return null;
  const declared = (cube.measures as { name?: string; format?: string }[] | undefined) ?? [];
  const currency = String((cube.currency as string | undefined) || DEFAULT_CUBE_CURRENCY);
  const out: ColumnSettingsMap = { ...(existing ?? {}) };
  let added = false;
  for (const name of measures) {
    if (out[name]) continue;
    const format = String(declared.find((m) => m?.name === name)?.format ?? "");
    const settings = settingsOfFormat(format, currency);
    if (!settings) continue;
    out[name] = settings;
    added = true;
  }
  return added ? out : null;
}

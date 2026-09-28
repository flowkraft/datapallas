import type { CubeSelection, WidgetType } from "@/lib/stores/canvas-store";
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

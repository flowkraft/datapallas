/**
 * What a table can do beyond Tabulator's own options (#28), set in the table's DSL - the Map the
 * Canvas writes and the published page reads - and turned into Tabulator here, once, for both:
 *
 * - `rbTotals true`: a totals row; every column whose values are numbers is summed (Tabulator's
 *   `bottomCalc`), written in the column's own format. A percent column has no meaningful sum and
 *   gets none.
 * - `rbHighlights [[field: 'total', kind: 'scale'|'bars'|'above'|'below', value: 100, color: 'red']]`:
 *   a colour scale, a bar in each cell, or one "above / below X" colour, on a column of numbers.
 *
 * Searching each column (`columnDefaults.headerFilter`) and dragging columns (`movableColumns`)
 * are Tabulator's own options and need nothing here.
 */

export type HighlightKind = 'scale' | 'bars' | 'above' | 'below';
export interface Highlight { field: string; kind: HighlightKind; value?: number; color?: string }

export const HIGHLIGHT_COLORS: Record<string, [number, number, number]> = {
  red: [220, 38, 38],
  green: [22, 163, 74],
  amber: [217, 119, 6],
  blue: [80, 158, 227],
};

const KINDS = new Set<HighlightKind>(['scale', 'bars', 'above', 'below']);

/** The rules a table's options hold that can be drawn; anything malformed is left out. */
export function highlightsOf(options: unknown): Highlight[] {
  const list = (options as Record<string, unknown> | undefined)?.rbHighlights;
  if (!Array.isArray(list)) return [];
  return list.filter((h): h is Highlight =>
    !!h && typeof h.field === 'string' && h.field !== '' && KINDS.has(h.kind)
    && ((h.kind !== 'above' && h.kind !== 'below') || (typeof h.value === 'number' && Number.isFinite(h.value))));
}

/** A cell's number, or null when it holds none. */
export function cellNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** The sum of a column's values, or '' when they are not all numbers (a text column has no total). */
export function sumIfNumbers(values: unknown[]): number | '' {
  let sum = 0;
  let seen = false;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = cellNumber(v);
    if (n === null) return '';
    sum += n;
    seen = true;
  }
  return seen ? Math.round(sum * 1e6) / 1e6 : '';
}

/** One column definition with its total: the sum, written the way the column writes its values. */
export function withTotal(def: Record<string, any>): Record<string, any> {
  if (def.formatter === 'percent' || def.bottomCalc !== undefined) return def;
  const out: Record<string, any> = { ...def, bottomCalc: sumIfNumbers };
  if (typeof def.formatter === 'string' || typeof def.formatter === 'function') {
    out.bottomCalcFormatter = def.formatter;
    if (def.formatterParams !== undefined) out.bottomCalcFormatterParams = def.formatterParams;
  }
  return out;
}

/** How one cell of a highlighted column is drawn: its background, given the column's range. */
export function highlightStyle(h: Highlight, value: number, range: { min: number; max: number }): string {
  const [r, g, b] = HIGHLIGHT_COLORS[h.color ?? ''] ?? (h.kind === 'above' || h.kind === 'below'
    ? HIGHLIGHT_COLORS.red : HIGHLIGHT_COLORS.blue);
  if (h.kind === 'above') return value > (h.value as number) ? `rgba(${r}, ${g}, ${b}, 0.25)` : '';
  if (h.kind === 'below') return value < (h.value as number) ? `rgba(${r}, ${g}, ${b}, 0.25)` : '';
  if (h.kind === 'scale') {
    const t = range.max > range.min ? (value - range.min) / (range.max - range.min) : 1;
    return `rgba(${r}, ${g}, ${b}, ${(0.08 + 0.57 * t).toFixed(2)})`;
  }
  // Bars grow from zero (or from the smallest value, when every value is below it).
  const from = Math.min(0, range.min);
  const span = range.max - from;
  const pct = span > 0 ? Math.round(((value - from) / span) * 100) : 100;
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.35) ${pct}%, transparent ${pct}%)`;
}

/** The smallest and the largest number of each field, over the rows given. */
export function rangesOf(rows: Record<string, unknown>[], fields: string[]): Record<string, { min: number; max: number }> {
  const out: Record<string, { min: number; max: number }> = {};
  for (const field of fields) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
      const n = cellNumber(row?.[field]);
      if (n === null) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (min !== Infinity) out[field] = { min, max };
  }
  return out;
}

/**
 * Turn the table's own keys into Tabulator, in place: the totals into column definitions, the
 * highlights into a row formatter beside the author's. Returns what has to be told when new data
 * arrives (the ranges a scale and bars are drawn against), or null when there was nothing to do.
 */
export interface TableExtras {
  /** New data: the ranges a scale and bars are drawn against are read again. */
  dataChanged: () => void;
  /** Columns handed to the table later (`setColumns`) carry their totals too. */
  columns: <T>(cols: T) => T;
}

export function applyTableExtras(opts: Record<string, any>): TableExtras | null {
  const totals = opts.rbTotals === true;
  const highlights = highlightsOf(opts);
  delete opts.rbTotals;
  delete opts.rbHighlights;
  if (!totals && highlights.length === 0) return null;

  if (totals) {
    if (Array.isArray(opts.columns) && opts.columns.length) {
      opts.columns = opts.columns.map((c: Record<string, any>) => withTotal(c));
    } else {
      // The columns are made from the data: the author's own definitions first, as Tabulator would
      // merge them, then the total.
      const authored = opts.autoColumnsDefinitions;
      opts.autoColumnsDefinitions = (defs: Record<string, any>[]) => {
        let merged = defs;
        if (typeof authored === 'function') merged = authored(defs);
        else if (Array.isArray(authored)) {
          merged = defs.map((d) => ({ ...d, ...(authored.find((a: any) => a?.field === d.field) ?? {}) }));
        }
        return merged.map((d) => withTotal(d));
      };
    }
  }

  let ranges: Record<string, { min: number; max: number }> | null = null;
  if (highlights.length) {
    const fields = highlights.map((h) => h.field);
    const authorRowFormatter = opts.rowFormatter;
    opts.rowFormatter = (row: any) => {
      if (typeof authorRowFormatter === 'function') authorRowFormatter(row);
      // The totals row is drawn through the same formatter: its sums are not values to colour.
      if (row.getElement?.()?.classList?.contains('tabulator-calcs')) return;
      if (!ranges) ranges = rangesOf(row.getTable?.().getData?.() ?? [], fields);
      for (const h of highlights) {
        const cell = row.getCell?.(h.field);
        const el = cell?.getElement?.();
        if (!el) continue;
        const value = cellNumber(cell.getValue());
        const style = value === null ? '' : highlightStyle(h, value, ranges[h.field] ?? { min: value, max: value });
        el.style.background = style;
        if (style) el.setAttribute('data-rb-highlight', h.kind);
        else el.removeAttribute('data-rb-highlight');
      }
    };
  }
  return {
    dataChanged: () => { ranges = null; },
    columns: <T>(cols: T): T => (totals && Array.isArray(cols)
      ? (cols.map((c: Record<string, any>) => withTotal(c)) as unknown as T) : cols),
  };
}

/** The narrowest a column is drawn when its author set no width of their own, in pixels. */
export const COLUMN_FLOOR_PX = 90;

/**
 * Every column at least `COLUMN_FLOOR_PX` wide, unless the author's `columnDefaults` says otherwise.
 *
 * Fitted into a half-width tile, or into a phone, a table of seven or eight columns squeezed each one
 * to two letters - "A...", "K...", "17,81..." (DD11, DD13, and every table on a phone). With a floor
 * the columns keep their words and the table scrolls sideways inside its tile instead.
 */
export function withColumnFloor(opts: Record<string, any>): void {
  opts.columnDefaults = { minWidth: COLUMN_FLOOR_PX, ...(opts.columnDefaults || {}) };
}

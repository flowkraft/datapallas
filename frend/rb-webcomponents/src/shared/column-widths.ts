/**
 * Table columns as wide as what they hold (V65).
 *
 * Fitted into its tile, Tabulator's `fitColumns` gives every column the same width: a product name
 * and an "Opportunity" header are cut to "Windhoek Speake..." and "Oppor..." while SKU, Category and
 * an empty "Closed" keep half of theirs. Here each column is measured the way it is drawn - its
 * header, and its cells on screen, totals included - and the tile's width is shared out by that:
 *
 * - everything fits: each column gets its own width, and the room left over is shared out in
 *   proportion to it;
 * - not everything fits: the narrow columns keep their whole width and only the widest are cut,
 *   all to the same width - so no column is ever cut more than the even split cut it;
 * - and when even that would leave the cut columns under `CUT_FLOOR_PX`, the table scrolls sideways
 *   inside its tile instead (a phone, a narrow tile), each column as wide as it needs up to
 *   `COLUMN_CAP_PX`.
 *
 * A table whose author set widths of their own, or grouped columns under one header, is left as
 * the author set it, and so is a column a reader has dragged wider or narrower.
 */

import { COLUMN_FLOOR_PX } from './table-extras.ts';

/** Under this a long column cut to fit shows too little of itself: the table scrolls instead. */
export const CUT_FLOOR_PX = 120;

/** The widest a column grows when the table scrolls sideways anyway. */
export const COLUMN_CAP_PX = 320;

/**
 * The width of each column, given the width each needs (`natural`), the room there is (`available`)
 * and the narrowest each may be (`floors`). `scroll` says the widths add up to more than the room.
 * Nothing (null) when there are no columns or no room to share.
 */
export function shareWidths(
  natural: number[],
  available: number,
  floors: number[] = [],
): { widths: number[]; scroll: boolean } | null {
  const n = natural.length;
  if (n === 0 || !(available > 0)) return null;
  const floorOf = (i: number) => floors[i] ?? COLUMN_FLOOR_PX;
  const want = natural.map((w, i) => Math.ceil(Math.max(Number.isFinite(w) ? w : 0, floorOf(i))));
  const total = want.reduce((a, b) => a + b, 0);
  const room = Math.floor(available);

  if (total <= room) {
    const widths = want.map((w) => Math.floor(w + ((room - total) * w) / total));
    widths[n - 1] += room - widths.reduce((a, b) => a + b, 0);
    return { widths, scroll: false };
  }

  // The cut: one width for every column wider than it, chosen so that the columns fill the room.
  // Narrowest first: a column that fits within an even share of what is left keeps its width.
  const order = want.map((_, i) => i).sort((a, b) => want[a] - want[b]);
  let left = room;
  let rest = n;
  let cut = 0;
  for (const i of order) {
    if (want[i] * rest <= left) {
      left -= want[i];
      rest--;
      continue;
    }
    cut = Math.floor(left / rest);
    break;
  }
  const cutColumns = want.map((_, i) => i).filter((i) => want[i] > cut);
  const cutFloor = Math.max(CUT_FLOOR_PX, ...cutColumns.map(floorOf));
  if (cut >= cutFloor) {
    const widths = want.map((w) => Math.min(w, cut));
    widths[cutColumns[cutColumns.length - 1]] += room - widths.reduce((a, b) => a + b, 0);
    return { widths, scroll: false };
  }
  return { widths: want.map((w, i) => Math.max(floorOf(i), Math.min(w, COLUMN_CAP_PX))), scroll: true };
}

/** The widths this file wrote into column definitions: any other width there is the author's. */
const fitted = new WeakMap<object, number>();

/** A column definition the author sized or grouped: the table is then theirs to lay out. */
export function authorSizedColumns(definitions: Array<Record<string, unknown>>): boolean {
  return definitions.some((d) => d && ((d.width !== undefined && fitted.get(d) !== d.width)
    || d.widthGrow !== undefined || d.widthShrink !== undefined || Array.isArray(d.columns)));
}

/** Write a width into a column definition, as this file's own. */
export function writeFittedWidth(definition: Record<string, unknown>, width: number): void {
  definition.width = width;
  fitted.set(definition, width);
}

/** The width an element would take with nothing holding it in: its content's, padding included. */
function naturalWidths(elements: HTMLElement[]): number[] {
  const before = elements.map((el) => el.style.width);
  elements.forEach((el) => { el.style.width = 'max-content'; });
  const widths = elements.map((el) => el.getBoundingClientRect().width);
  elements.forEach((el, i) => { el.style.width = before[i]; });
  return widths;
}

/**
 * Size a `fitColumns` table's columns to what they hold (see the top of this file). Returns false,
 * touching nothing, when the table is not one to size: another layout, author widths, column
 * groups, or not on screen. The widths are written into the columns' definitions as well, so that
 * Tabulator's own re-layouts (a redraw, a reload) keep them; a change of the tile's width asks for
 * this again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitColumnsToContent(table: any, root: HTMLElement): boolean {
  if (table?.options?.layout !== 'fitColumns') return false;
  // The top-level definitions, a group's among them (`getColumns()` lists only the leaves).
  if (authorSizedColumns(table.getColumnDefinitions())) return false;
  const holder = root.querySelector('.tabulator-tableholder') as HTMLElement | null;
  if (!holder || holder.clientWidth === 0) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: any[] = table.getColumns().filter((c: any) => c.isVisible());
  if (columns.length === 0) return false;

  const field = (c: any): string => c.getField() ?? '';
  // A header: its title as wide as its words, plus what is drawn around the title (padding, the
  // sort arrow's room).
  const titles = columns.map((c) => (c.getElement() as HTMLElement).querySelector('.tabulator-col-title') as HTMLElement | null);
  const around = columns.map((c, i) => (titles[i]
    ? (c.getElement() as HTMLElement).getBoundingClientRect().width - titles[i]!.getBoundingClientRect().width : 0));
  const headerWidths = naturalWidths(titles.filter((t): t is HTMLElement => !!t));
  let t = 0;
  const natural = columns.map((_, i) => (titles[i] ? headerWidths[t++] + around[i] : 0));
  // The cells on screen, and the totals row's.
  columns.forEach((c, i) => {
    const cells: HTMLElement[] = c.getCells().map((cell: any) => cell.getElement() as HTMLElement);
    const name = field(c);
    if (name) {
      root.querySelectorAll('.tabulator-calcs .tabulator-cell').forEach((el) => {
        if (el.getAttribute('tabulator-field') === name) cells.push(el as HTMLElement);
      });
    }
    for (const w of naturalWidths(cells)) natural[i] = Math.max(natural[i], w);
  });

  const scrollbar = holder.offsetWidth - holder.clientWidth;
  const available = Math.floor(holder.getBoundingClientRect().width) - scrollbar;
  const floors = columns.map((c) => Number(c.getDefinition().minWidth ?? COLUMN_FLOOR_PX) || COLUMN_FLOOR_PX);
  const shared = shareWidths(natural.map((w) => Math.ceil(w)), available, floors);
  if (!shared) return false;
  columns.forEach((c, i) => {
    const w = shared.widths[i];
    writeFittedWidth(c.getDefinition(), w);
    if (Math.abs(c.getWidth() - w) >= 1) c.setWidth(w);
  });
  return true;
}

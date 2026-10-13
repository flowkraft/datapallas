// What a reader picked in the slicers of one published dashboard, and what that does to its
// tiles.
//
// A slicer applies by itself: the reader clicks a value and every tile built on that table answers for that
// value, with no author's SQL mentioning it. The rule is the canvas's, written once there and once
// here because the same dashboard has to answer the same question in both places
// (LOGIC-MIRROR of `ui-startpage/lib/explore-data/slicer-filters.ts`):
//
//   - the values picked for ONE field are OR-ed together - one `IN (...)` list;
//   - different fields are AND-ed together - one condition each;
//   - a field with nothing picked is no condition at all: every row.
//
// How a value reaches the database: never in the SQL text. Each slicer field owns one parameter,
// `__slicer_<field>`, which the canvas wrote into the widget's SQL and the published script declares
// like any other filter value - so an empty one turns its line off (`SqlParameterLines`, and the
// script's own `has<P> && listHasValues` guard).
//
// A slicer selection only ever NARROWS: a slicer parameter is the slicer's own name, never a parameter
// the author declared, so it cannot overwrite a filter-bar value, a value locked by a share link,
// a per-recipient value or anything an embed token fixed. Those are decided on the server and stay
// decided.
//
// Plain functions and one small object in a module of their own, next to `url-start-values.ts`, so
// the rule can be read in one place - and so the filter bar and the dashboard page work from the
// same selections instead of two copies that drift.

/** The one prefix a slicer parameter carries, so nothing else can be taken for one. */
export const SLICER_PARAM_PREFIX = '__slicer_';

/**
 * The parameter one slicer field binds its values to.
 *
 * The name is a bind name in SQL and a variable name in the published script, so anything that is
 * not a word character becomes `_` - exactly as the canvas spells it, or the two would bind
 * different names for the same slicer.
 */
export function slicerParamName(field: string): string {
  return SLICER_PARAM_PREFIX + field.replace(/[^A-Za-z0-9_]/g, '_');
}

/** True for a parameter this module owns - not a filter the author declared. */
export function isSlicerParamName(name: string): boolean {
  return name.startsWith(SLICER_PARAM_PREFIX);
}

/** One picked value of one field. */
export interface SlicerSelection {
  field: string;
  value: string;
}

/**
 * The picks of one dashboard: which values of which fields the reader has on.
 *
 * Order is the order the reader picked in, which is the order the chips are shown in.
 */
export class SlicerSelections {

  private picks: SlicerSelection[] = [];

  /** Every pick, in the order they were made. */
  list(): SlicerSelection[] {
    return this.picks.slice();
  }

  /** The values picked for one field. */
  valuesOf(field: string): string[] {
    return this.picks.filter((pick) => pick.field === field).map((pick) => pick.value);
  }

  /** The fields anything is picked in, in order. */
  fields(): string[] {
    const seen: string[] = [];
    for (const pick of this.picks) if (!seen.includes(pick.field)) seen.push(pick.field);
    return seen;
  }

  get size(): number {
    return this.picks.length;
  }

  /**
   * Pick a value, or drop it again - one click in a slicer.
   *
   * A single-select slicer holds one value at a time: picking another replaces it, and picking the
   * one that is on drops it, so a reader can always get back to "no filter".
   */
  toggle(field: string, value: string, multiSelect: boolean = true): void {
    if (!field) return;
    const already = this.picks.some((pick) => pick.field === field && pick.value === value);
    if (already) {
      this.picks = this.picks.filter((pick) => !(pick.field === field && pick.value === value));
      return;
    }
    if (!multiSelect) this.picks = this.picks.filter((pick) => pick.field !== field);
    this.picks = [...this.picks, { field, value }];
  }

  /** Drop one pick, whatever slicer it was made in (what a chip's x does). */
  remove(field: string, value: string): void {
    this.picks = this.picks.filter((pick) => !(pick.field === field && pick.value === value));
  }

  /** Drop every pick at once (what Clear all does). */
  clear(): void {
    this.picks = [];
  }

  /**
   * The value of every slicer parameter of this dashboard: the picked values comma separated, and the
   * empty string for a field nothing is picked in.
   *
   * Every slicer field is always sent, because a `${...}` the request says nothing about is not a
   * parameter the server can leave out of the SQL - and leaving it out is what makes "nothing
   * picked" mean "every row".
   */
  paramValues(slicerFields: readonly string[]): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of slicerFields) values[slicerParamName(field)] = this.valuesOf(field).join(',');
    return values;
  }
}

/** The picks of each dashboard on the page, by report id: 25 dashboards never share one set. */
const perReport = new Map<string, SlicerSelections>();

/** The picks of one dashboard, made the first time something asks for them. */
export function slicerSelectionsFor(reportId: string): SlicerSelections {
  let selections = perReport.get(reportId);
  if (!selections) {
    selections = new SlicerSelections();
    perReport.set(reportId, selections);
  }
  return selections;
}

/** The element a slicer is published as. */
/**
 * The event a tile fires when a click of its own makes a selection: a chart bar, a table cell, a
 * map point, on a tile whose author ticked "Clicks filter the dashboard" (`clicksFilter`).
 *
 * One name for all three, and the same shape a slicer's own event carries (`{field, value}`), so
 * the canvas and the published page each listen once and do the same thing with it. A tile that
 * was not ticked fires nothing at all, which is why a dashboard nobody ticked cannot change.
 */
export const CROSS_FILTER_EVENT = 'crossFilterSelect';

export const SLICER_TAG = 'rb-slicer';

/**
 * The fields the slicers of this dashboard filter by, in the order the page lays them out.
 *
 * Asked of the page itself rather than of a config file, because that is where the slicers are: the
 * publisher writes `field="channel"` onto each one, and a slicer whose field the author left empty
 * filters nothing and is left out. Every field found is sent with every request - a field with
 * nothing picked sends an empty value, which is what turns its condition off.
 */
export function slicerFieldsOnPage(host: Element | null | undefined): string[] {
  if (!host) return [];
  const root = host.closest('.rb-dashboard-root') || (host.getRootNode() as Element | Document) || document;
  const fields: string[] = [];
  (root as Element | Document).querySelectorAll(SLICER_TAG).forEach((slicer: Element) => {
    const field = fieldOf(slicer);
    if (field && !fields.includes(field)) fields.push(field);
  });
  return fields;
}

/** The field one slicer shows: its property when it is already a component, its attribute before. */
export function fieldOf(slicer: Element): string {
  const own = (slicer as unknown as { field?: unknown }).field;
  if (typeof own === 'string' && own) return own;
  return slicer.getAttribute('field') || '';
}

/** The widgets a parameter change re-fetches: everything that shows rows, slicers excluded. */
export const DATA_WIDGET_TAGS = 'rb-tabulator, rb-chart, rb-pivot-table, rb-value, rb-trend, rb-map, '
  + 'rb-sankey, rb-gauge, rb-progress, rb-detail, rb-cube-renderer';

/**
 * Hand new parameter values to every data widget of a dashboard, so each fetches its rows again.
 *
 * A widget reads its parameters from its own `report-params` attribute at mount, so it is replaced
 * by a copy of itself carrying the new ones: that is the one way an injected, self-fetching widget
 * can be asked the same question with different values.
 *
 * A slicer is NOT in that list, on purpose: its own value list does not change when something
 * is picked (that is what lets a reader pick twice), and replacing it would throw away the picks
 * the reader can see in it.
 *
 * @param host   any element inside the dashboard, or the dashboard's root
 * @param values the parameter values the widgets should ask with: the filter bar's, with the slicers'
 * @param options.keepUnchanged leave a widget that already asks with exactly these values: the filter
 *               bar's first apply, after the dashboard put its tiles on the page with the values the
 *               bar opens with. A reader's Apply always asks again.
 */
export function refreshDataWidgets(host: Element | null | undefined,
                                   values: Record<string, unknown>,
                                   options: { keepUnchanged?: boolean } = {}): void {
  if (!host) return;
  const root = host.closest('.rb-dashboard-root') || (host.getRootNode() as Element | Document) || document;
  const paramsJson = JSON.stringify(values);
  const widgets = (root as Element | Document).querySelectorAll(DATA_WIDGET_TAGS);
  widgets.forEach((el: Element) => {
    if (options.keepUnchanged && el.getAttribute('report-params') === paramsJson) return;
    el.parentNode?.replaceChild(freshCopy(el, paramsJson), el);
  });
}

/**
 * A new element for a widget, to put in its place so it fetches its rows again: the same attributes,
 * the new `report-params` when given, and what it is showing now. A tile's Refresh (#19) asks for one
 * with the values it already has.
 */
export function freshCopy(el: Element, paramsJson?: string): Element {
  const fresh = document.createElement(el.tagName.toLowerCase());
  for (const attr of Array.from(el.attributes)) fresh.setAttribute(attr.name, attr.value);
  if (paramsJson !== undefined) fresh.setAttribute('report-params', paramsJson);
  // A widget a person can tick things on is showing something it was not published showing, and
  // that is not ours to throw away: it says what it is showing, and the element that takes its
  // place opens there.
  const localState = localStateOf(el);
  if (localState) fresh.setAttribute('local-state', localState);
  return fresh;
}

/**
 * What a widget is showing right now, if it says: a cube renderer hands over the ticks the viewer
 * made, which nothing else knows about. A widget that offers nothing hands over nothing.
 */
function localStateOf(el: Element): string {
  const say = (el as unknown as { rbLocalState?: () => unknown }).rbLocalState;
  if (typeof say !== 'function') return '';
  try {
    const state = say.call(el);
    return typeof state === 'string' ? state : '';
  } catch {
    // A widget that cannot say where it is still gets replaced: it opens on its saved view.
    return '';
  }
}

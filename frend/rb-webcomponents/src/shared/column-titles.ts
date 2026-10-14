/**
 * The header a published table gives a column it made from its data.
 *
 * A table whose columns are made from its rows (`autoColumns`) headed each one with the name the
 * query gave it: `revenue_this_year`, `growth_pct`, `first_order_value`, cut to `revenue_same_period_last_...`
 * on half the demos, beside tables whose columns the author titled. A name written the way a query
 * writes one - lower case, words joined by `_` - is headed the way a reader writes it ("Revenue this
 * year", "Growth %"). Any other name was written for the reader already and is kept, as is a title
 * the column's definition gives.
 *
 * Pure, so `npm test` asks it directly - see column-titles.test.ts.
 */

/** Lower case, digits and `_`: the way a query names a column. */
const QUERY_NAME_RX = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Words a reader writes otherwise. */
const WORDS: Record<string, string> = { pct: '%', id: 'ID', sku: 'SKU', csat: 'CSAT', sla: 'SLA', kpi: 'KPI' };

/** @returns the reader's header for a column named `field`, or null when the name is one already */
export function readerTitle(field: string): string | null {
  if (!QUERY_NAME_RX.test(field)) return null;
  const words = field.split('_').map((word) => WORDS[word] ?? word);
  const first = words[0];
  words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(' ');
}

/**
 * The column definitions of a table made from `rows`, with a reader's title on each column named the
 * way a query names one. Takes and returns `autoColumnsDefinitions` in the shape it came in (a list,
 * an object by field, or nothing); a definition written as a function makes its own columns and is
 * returned as it is.
 */
export function withReaderTitles(definitions: unknown, rows: any[]): unknown {
  if (typeof definitions === 'function') return definitions;
  if (!Array.isArray(rows) || rows.length === 0 || rows[0] == null || typeof rows[0] !== 'object') return definitions;
  const keyed = definitions != null && typeof definitions === 'object' && !Array.isArray(definitions);
  const listed: any[] = Array.isArray(definitions) ? definitions.map((d) => ({ ...d }))
    : keyed ? Object.entries(definitions as Record<string, any>).map(([field, d]) => ({ field, ...d })) : [];
  let changed = false;
  for (const field of Object.keys(rows[0])) {
    const title = readerTitle(field);
    if (!title) continue;
    let def = listed.find((d) => d?.field === field);
    if (def?.title) continue;
    if (!def) { def = { field }; listed.push(def); }
    def.title = title;
    changed = true;
  }
  if (!changed) return definitions;
  if (!keyed) return listed;
  return Object.fromEntries(listed.map(({ field, ...d }) => [field, d]));
}

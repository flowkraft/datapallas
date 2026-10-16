// What a dashboard story says about itself around Show Me: which filters it would change, how a menu
// entry reads in the gate, and the toast after Yes. Pure text and comparison, so it is tested on its own;
// the filter bar (RbParameters) supplies the values and the labels.

export interface StoryChange {
  id: string;
  label: string;
  from: string;
  to: string;
  toFull?: string;
}

/** The ids whose value would differ, in the bar's own order; a value is compared as the text it is. */
export function changedFilterIds(
  order: string[],
  before: { [id: string]: unknown },
  after: { [id: string]: unknown },
): string[] {
  const text = (value: unknown) => (value == null ? '' : String(value));
  return order.filter((id) => id in after && text(before[id]) !== text(after[id]));
}

/** A menu entry such as "-- All regions --" is a menu entry, not a name: the dashes go, and nothing left reads "All". */
export function cleanOptionLabel(label: unknown): string {
  return String(label ?? '').replace(/^[\s-]+|[\s-]+$/g, '') || 'All';
}

/** "Region: All → APAC  ·  Year: 2026 → 2025", or what to say when nothing would change. */
export function summariseChanges(changes: StoryChange[]): string {
  if (!changes.length) return 'The filters were already set to what this story asks for.';
  return changes.map((c) => c.label + ': ' + c.from + ' \u2192 ' + c.to).join('  \u00b7  ');
}

/** The two lines of the toast after Yes: the question that is now showing, and what it set. */
export function storyToastLines(question: unknown, changes: StoryChange[]): string[] {
  return ['Showing \u201c' + String(question ?? '').trim() + '\u201d', summariseChanges(changes)];
}

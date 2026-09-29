// Per-widget "we've already executed this version" tracker — module-level so it
// survives component remounts (the renderer auto-switch unmounts e.g.
// TabulatorWidget and mounts MapWidget; both call useWidgetData(widgetId), and
// the second call must dedup against the first to avoid a redundant fetch).
//
// The map is cleared on canvas load (`loadCanvas` in canvas-store.ts). Without
// that reset, navigating away from a canvas and back to it leaves stale entries
// keyed by the same widgetIds — the first effect run after remount matches the
// stale snapshot and SKIPs the fetch, leaving widgets blank until a hard
// refresh clears module state.

export interface LastExec {
  mode: string;
  executeVersion?: number;
  scriptVersion?: number;
  sql?: string;           // visual mode — built-once SQL signature
  filterSnapshot?: string; // JSON of filter values at last execution
}

/**
 * Whether a widget has to run again — one rule for a script, a SQL and a visual
 * widget alike: it runs again when anything the last execution was keyed on
 * changed, and it is skipped when nothing did.
 *
 * The skip is what keeps the effect from looping: it re-runs on every store
 * change, and without this it would fetch on each one.
 *
 * `next` carries only the keys its mode uses (a script has a `scriptVersion`, a
 * visual widget has its built `sql`), so a key neither side sets is `undefined`
 * on both and decides nothing.
 */
export function shouldReExecute(prev: LastExec | undefined, next: LastExec): boolean {
  if (!prev || prev.mode !== next.mode) return true;
  return prev.executeVersion !== next.executeVersion
    || prev.scriptVersion !== next.scriptVersion
    || prev.sql !== next.sql
    || prev.filterSnapshot !== next.filterSnapshot;
}

export const LAST_EXEC: Map<string, LastExec> = new Map();

export function clearWidgetExecCache(): void {
  LAST_EXEC.clear();
}

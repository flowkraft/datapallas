/**
 * Draw again when a widget's box changes size (V35).
 *
 * The gauge and the sankey draw an SVG to the size their box has when they draw. A box made
 * narrower afterwards - a window, a phone turned, a dashboard laid out again - kept the old drawing,
 * wider than its tile and cut at the tile's edge (DD08's gauge and DD04's sankey at 390 px).
 * A change under 2 px draws nothing, and nor does a box with no size (a hidden tab): it is drawn
 * when it has one again.
 */
export function redrawOnResize(el: Element, draw: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let last = { width: 0, height: 0 };
  let seen = false;
  let frame = 0;
  const observer = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    if (!box) return;
    const size = { width: box.width, height: box.height };
    // The first report is the size the widget was drawn at.
    if (!seen) { seen = true; last = size; return; }
    if (!resized(last, size)) return;
    last = size;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = 0; draw(); });
  });
  observer.observe(el);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

/** A box worth drawing again for: it has a size, and it is 2 px or more off the one drawn. */
export function resized(drawn: { width: number; height: number }, now: { width: number; height: number }): boolean {
  if (now.width <= 0 || now.height <= 0) return false;
  return Math.abs(now.width - drawn.width) >= 2 || Math.abs(now.height - drawn.height) >= 2;
}

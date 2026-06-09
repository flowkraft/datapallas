// Shared paginator windowing, used by every list that renders a daisyUI "join" pager.
//
// RADIUS = pages shown either side of the current page.
// MAX    = the most page buttons the windowed bar ever shows (first + last + the
//          window). It is also the threshold below which every page already fits, so
//          windowing would add "…" gaps without saving any space — hence "show all".
//
// Keep the threshold derived from the radius so the two can never drift apart.
export const PAGE_WINDOW_RADIUS = 2;
export const PAGE_WINDOW_MAX = 2 + (2 * PAGE_WINDOW_RADIUS + 1); // first + last + window = 7

/**
 * Page indices to render in a windowed pager: first, last, and ±RADIUS around the
 * current page. Collapsed gaps are emitted as -1 sentinels, which the template renders
 * as a non-clickable "…", so the bar stays a fixed width whether there are 8 pages or
 * 8000. Lists with PAGE_WINDOW_MAX pages or fewer return every page unchanged.
 *
 * @param total   total number of pages (>= 1)
 * @param current zero-based index of the current page
 */
export function buildPageWindow(total: number, current: number): number[] {
  if (total <= PAGE_WINDOW_MAX) return Array.from({ length: total }, (_, i) => i);

  const pages = new Set<number>([0, total - 1]);
  for (let p = current - PAGE_WINDOW_RADIUS; p <= current + PAGE_WINDOW_RADIUS; p++) {
    if (p >= 0 && p < total) pages.add(p);
  }

  const windowed: number[] = [];
  let prev = -1;
  for (const p of [...pages].sort((a, b) => a - b)) {
    if (prev !== -1 && p - prev > 1) windowed.push(-1);
    windowed.push(p);
    prev = p;
  }
  return windowed;
}

/**
 * A group of `<details name="...">` panels shows one open panel at a time: opening one closes the
 * others of its name. A browser does this itself; this is the same rule written down once, so a
 * dashboard shows it whatever drew the page, and so it can be tested without a browser.
 */
export interface PanelLike {
  open: boolean;
  getAttribute(name: string): string | null;
}

/**
 * Closes every other open panel that carries the opened panel's name.
 *
 * @returns the panels that were closed (none when the panel has no name, or nothing else was open)
 */
export function closeOthersOfGroup<T extends PanelLike>(opened: T, panels: Iterable<T>): T[] {
  const name = opened.getAttribute('name');
  if (!name || !opened.open) return [];
  const closed: T[] = [];
  for (const panel of panels) {
    if (panel === opened || !panel.open || panel.getAttribute('name') !== name) continue;
    panel.open = false;
    closed.push(panel);
  }
  return closed;
}

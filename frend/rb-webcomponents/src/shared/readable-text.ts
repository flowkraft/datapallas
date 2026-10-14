/**
 * The text colour that reads on a given background.
 *
 * A pivot heatmap paints each cell from near-white to red and kept the page's text colour on it: on
 * the dark theme that is white text, and the low cells of every heatmap of the demos read white on
 * near-white. A cell that paints its own background takes its text colour from that background:
 * dark on a light one, white on a dark one (the WCAG relative luminance, split where both contrast
 * the same).
 *
 * Pure, so `npm test` asks it directly - see readable-text.test.ts.
 */

const DARK = '#111111';
const LIGHT = '#ffffff';

/** Relative luminance where black and white contrast a background equally. */
const EQUAL_CONTRAST = 0.179;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * @param background `rgb(r,g,b)`, `rgba(r,g,b,a)` or `#rrggbb`
 * @returns the text colour for it, or null for a colour it cannot read (the page's colour stays)
 */
export function readableTextOn(background: string): string | null {
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(background || '');
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background || '');
  const parts = rgb ? [rgb[1], rgb[2], rgb[3]].map(Number)
    : hex ? [hex[1], hex[2], hex[3]].map((h) => parseInt(h, 16)) : null;
  if (!parts || parts.some((p) => !Number.isFinite(p))) return null;
  const [r, g, b] = parts;
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > EQUAL_CONTRAST ? DARK : LIGHT;
}

/** The `style` attribute of a cell painted `background`: the background and the text that reads on it. */
export function paintedCellStyle(background: string | undefined): string {
  if (!background) return '';
  const text = readableTextOn(background);
  return ` style="background-color:${background}${text ? ';color:' + text : ''}"`;
}

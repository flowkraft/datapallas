/**
 * How a number tile and a trend tile write a plain number and a change.
 *
 * A plain number was written with as many decimals as the locale's default allowed: three on a
 * number tile ("Average first response, minutes 836.548"), one on a trend tile, also on a figure in
 * the millions ("Per month 2,363,956.2"). A plain number keeps two decimals below a thousand and
 * none from a thousand up: the precision a reader reads at that size.
 *
 * A change of 0.0% was drawn "▼ 0.0% vs prior" in the red of a fall. A change that rounds to nothing
 * is said flat, with no arrow and no colour of its own.
 *
 * Pure, so `npm test` asks it directly - see kpi-format.test.ts.
 */

/** A plain number as a KPI writes it: two decimals below a thousand, none from a thousand up. */
export function kpiNumber(n: number, locale?: string): string {
  return n.toLocaleString(locale, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
}

export type TrendTone = 'up' | 'down' | 'flat';

/** A change against the period before, as a trend tile writes it, and which way it went. */
export function trendDelta(delta: number): { text: string; tone: TrendTone } {
  const shown = (Math.abs(delta) * 100).toFixed(1);
  if (Number(shown) === 0) return { text: '0.0% vs prior', tone: 'flat' };
  return delta > 0
    ? { text: `▲ ${shown}% vs prior`, tone: 'up' }
    : { text: `▼ ${shown}% vs prior`, tone: 'down' };
}

/** What a number tile shows for a query that answered no value: a dash, not an empty tile. */
export const NO_VALUE = '—';

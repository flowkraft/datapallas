/**
 * Box plot data: one box per category, drawn from every value the category has. `<rb-chart>` is
 * handed its data in two shapes - the rows of the query (a published report's `/data`) or data a
 * caller has already drawn with one point per row (the Canvas) - and both keep every value, so
 * both give the same boxes.
 */

export interface BoxPlotData {
  labels: string[];
  datasets: { label: string; data: number[][] }[];
}

/** A value a box can hold: a finite number. An empty cell is no value, not a zero. */
function valueOf(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function addTo(groups: Map<string, number[]>, label: string, v: unknown): void {
  let values = groups.get(label);
  if (!values) { values = []; groups.set(label, values); }
  for (const one of Array.isArray(v) ? v : [v]) {
    const n = valueOf(one);
    if (n !== null) values.push(n);
  }
}

/** From the query's rows: the category column and the metric column. */
export function boxPlotFromRows(rows: any[], xField: string, yField: string): BoxPlotData {
  const groups = new Map<string, number[]>();
  for (const row of rows ?? []) addTo(groups, String(row?.[xField] ?? ''), row?.[yField]);
  const labels = [...groups.keys()];
  return { labels, datasets: [{ label: yField, data: labels.map((k) => groups.get(k)!) }] };
}

/**
 * From drawn data: point i of each dataset belongs to label i, and a label met again adds its
 * values to the same box. A point that already holds a list of values gives all of them.
 */
export function boxPlotFromDrawn(drawn: any): BoxPlotData {
  const pointLabels: unknown[] = drawn?.labels ?? [];
  const labels = [...new Set(pointLabels.map((l) => String(l ?? '')))];
  const datasets = (drawn?.datasets ?? []).map((ds: any, d: number) => {
    const groups = new Map<string, number[]>(labels.map((k) => [k, []]));
    (ds?.data ?? []).forEach((v: unknown, i: number) => {
      if (i < pointLabels.length) addTo(groups, String(pointLabels[i] ?? ''), v);
    });
    return { label: String(ds?.label ?? `Series ${d + 1}`), data: labels.map((k) => groups.get(k)!) };
  });
  return { labels, datasets };
}

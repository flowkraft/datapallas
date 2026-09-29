/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: the chart DSL Map at `displayConfig.dslConfig` is the
 * single source of truth, and the SAME Map flows to `<rb-chart>` in the Canvas
 * and to `<rb-chart>` on the published page. This file is what makes the first
 * of those two true for the whole Map: it turns the Canvas's own defaults plus
 * `dslMap.options` into the options object the Canvas hands to the element, so
 * a `scales.y.stacked`, a second axis `scales.y1`, an axis title, a tick format
 * or a `plugins.tooltip` written in the DSL renders in the Canvas exactly as it
 * renders once published.
 *
 * The published page reaches the same result by a different route: `rb-chart`
 * merges `chartConfig.options` over its own defaults (`RbChart.wc.svelte`,
 * `buildConfig`). The Canvas has no `chartConfig`, so it merges here instead —
 * same precedence, same keys, one behaviour.
 * ============================================================================
 */
import type { ChartDataBlock, ChartDslOptions } from "./chart-mapping";

type Dict = Record<string, unknown>;

function isPlainObject(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `over` onto `base`, key by key: a nested object is merged, any
 * other value replaces, and a key `over` does not carry keeps `base`'s value.
 * An explicit `undefined` in `over` means "not said", not "erase", because that
 * is what an absent DSL key deserializes to.
 */
export function deepMergeOptions(base: Dict, over: Dict): Dict {
  const out: Dict = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value)
      ? deepMergeOptions(current, value)
      : value;
  }
  return out;
}

/** What the Canvas decides for itself, before the DSL has its say. */
export interface CanvasChartDefaultsInput {
  /** `options.plugins.title.text` as the Map holds it; empty means no title. */
  chartTitle: string;
  /** The legend rule the Canvas resolved ("auto" already turned into a boolean). */
  legendDisplay: boolean;
  /** A pie or a doughnut: no cartesian axes, and a legend on the right. */
  isPieType: boolean;
  /** A bar chart the Canvas renders side by side rather than stacked. */
  isGroupedBar: boolean;
}

/**
 * The Canvas's own chart options — what the widget rendered before the DSL was
 * merged in, unchanged: no aspect-ratio lock, no animation, no x grid, a light
 * y grid, no scales at all for a pie, and side-by-side bars for a grouped bar.
 */
export function canvasChartDefaults(input: CanvasChartDefaultsInput): Dict {
  const { chartTitle, legendDisplay, isPieType, isGroupedBar } = input;
  return {
    maintainAspectRatio: false,
    animation: false,                          // clutter cut: instant updates
    plugins: {
      title: {
        display: Boolean(chartTitle),
        text: chartTitle,
      },
      legend: {
        display: legendDisplay,
        ...(isPieType && legendDisplay ? { position: "right" } : {}),
      },
    },
    // Pie/doughnut charts have no cartesian axes — omitting scales prevents
    // Chart.js from rendering phantom axis numbers around the chart.
    ...(!isPieType && {
      scales: {
        x: {
          grid: { display: false },
          // The forced side-by-side of a grouped bar is a default like any
          // other: a DSL that says `stacked` overrides it below.
          ...(isGroupedBar ? { stacked: false } : {}),
        },
        y: {
          grid: { color: "rgba(0,0,0,0.06)" },
          title: { display: false },
          ...(isGroupedBar ? { stacked: false } : {}),
        },
      },
    }),
  };
}

/**
 * The options the Canvas hands to `<rb-chart>`: the Canvas defaults, with
 * `dslMap.options` deep-merged over them, so the DSL wins wherever it speaks
 * and the defaults stand wherever it is silent.
 *
 * One rule survives the merge: a chart the Canvas draws without axes (a pie or
 * a doughnut, which is what `canvasDefaults` carrying no `scales` means) keeps
 * none, even if a stray `scales` key is left in the Map from an earlier chart
 * type. Chart.js would otherwise draw phantom axis numbers around the pie.
 */
export function buildCanvasChartOptions(
  dslMap: ChartDslOptions | null | undefined,
  canvasDefaults: Dict,
): Dict {
  const fromDsl = isPlainObject(dslMap?.options) ? (dslMap!.options as Dict) : {};
  const merged = deepMergeOptions(canvasDefaults, fromDsl);
  if (!("scales" in canvasDefaults)) delete merged.scales;
  return merged;
}

/** One dataset as the Canvas builds it, before the DSL's own keys are carried in. */
type BuiltDataset = Dict & { label: string };

/**
 * Carries the dataset-level keys of the DSL Map (`data.datasets[i]`) into the
 * datasets the Canvas built — `yAxisID`, `order`, `borderDash`, a fixed colour,
 * a label — the way the published page carries them.
 *
 * It matches what `rb-chart` does, and nothing more (`RbChart.wc.svelte`,
 * `transformChartConfigToChartJS`):
 *   - without a series breakout, one DSL dataset stands for one built dataset,
 *     in order: every key but `field` is carried over, and the DSL's `label`
 *     wins because that is the label the published chart shows;
 *   - with a series breakout, the published page builds its datasets from the
 *     pivot alone and keeps no dataset key, so neither does the Canvas.
 */
export function applyDatasetDslKeys<T extends BuiltDataset>(
  datasets: T[],
  dslMap: ChartDslOptions | null | undefined,
  seriesActive: boolean,
): T[] {
  if (seriesActive) return datasets;
  const data = (dslMap?.data as ChartDataBlock | undefined) ?? {};
  const dslDatasets = (data.datasets ?? []) as Dict[];
  if (dslDatasets.length === 0) return datasets;
  return datasets.map((built, index) => {
    const fromDsl = dslDatasets[index];
    if (!isPlainObject(fromDsl)) return built;
    const carried: Dict = { ...fromDsl };
    delete carried.field;
    delete carried.data;
    for (const key of Object.keys(carried)) {
      if (carried[key] === undefined) delete carried[key];
    }
    return { ...built, ...carried } as T;
  });
}

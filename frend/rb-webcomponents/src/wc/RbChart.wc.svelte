<svelte:options customElement="rb-chart" accessors={true} />

<script context="module" lang="ts">
  // Module-level: shared across all <rb-chart> instances on the page.
  // Deduplicates config requests when N components share the same report-id.
  const _cfgCache = new Map<string, Promise<any>>();

  function fetchConfigCached(url: string, headers: Record<string, string>): Promise<any> {
    let p = _cfgCache.get(url);
    if (p) return p;
    p = fetch(url, { headers })
      .then(r => { if (!r.ok) throw new Error(`Config fetch failed: ${r.status}`); return r.json(); })
      .catch(e => { _cfgCache.delete(url); throw e; });
    _cfgCache.set(url, p);
    return p;
  }
</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy, tick, createEventDispatcher } from 'svelte';

  // DEBUG: counters for lifecycle events
  let _afterUpdateCount = 0;
  let _lastAfterUpdateLogTime = 0;

  // ============================================================================
  // Hybrid Mode Props - when reportId is provided, component self-fetches
  // ============================================================================
  export let reportId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';
  export let componentId: string = '';
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  // ============================================================================
  // Props Mode - traditional props-based usage (e.g., from Angular)
  // ============================================================================
  export let data: any = { labels: [], datasets: [] };
  export let options: any = {};
  export let type: string | undefined = undefined; // if undefined, datasets may specify own types
  export let loading: boolean = false;
  export let plugins: any[] = [];
  export let responsive: boolean = true;
  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  // ============================================================================
  // Internal state for self-fetch mode
  // ============================================================================
  let selfFetchLoading = false;
  let error: string | null = null;
  
  // Raw DSL source code (exposed for Configuration tab)
  export let configDsl: string = '';
  
  // Full chart configuration from DSL (type, labelField, datasets, options)
  let chartConfig: any = null;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let chart: any = null;
  let lastChartType: string | undefined = undefined;
  const dispatch = createEventDispatcher();

  // reuse ResizeObserver patch from RbTabulator
  function transformChartConfigToChartJS(chartConfig: any, reportData: any[]) {
    if (!reportData || reportData.length === 0) return { labels: [], datasets: [] };

    const labelField = chartConfig.labelField || Object.keys(reportData[0]).find((k: string) => typeof reportData[0][k] === 'string') || Object.keys(reportData[0])[0];
    const seriesField: string | undefined = chartConfig.seriesField || undefined;

    // Coerce raw cell value to numeric (or null) — same rule the non-pivot path uses.
    const toNum = (val: any): number | null => {
      if (val == null) return null;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const n = Number(val);
        return isNaN(n) ? null : n;
      }
      return val;
    };

    // Series-pivot path: when seriesField is set, the row stream looks like
    //   { ts, strategy_run_id, equity_avg }
    // and we want N datasets — one per distinct strategy_run_id — each carrying
    // the equity_avg value at every timestamp. Without this branch the chart
    // collapses everything into one zig-zag line that jumps between runs.
    if (seriesField && chartConfig.datasets && chartConfig.datasets.length > 0) {
      const valueField = chartConfig.datasets[0].field;
      if (valueField) {
        // Distinct, ordered labels (preserve first-seen order — matches GROUP BY+ORDER BY).
        const labelOrder: string[] = [];
        const labelSet = new Set<string>();
        for (const row of reportData) {
          const lab = row[labelField] != null ? String(row[labelField]) : '';
          if (!labelSet.has(lab)) { labelSet.add(lab); labelOrder.push(lab); }
        }
        // Distinct series values + lookup table { seriesValue: { label: numericValue } }
        const seriesOrder: string[] = [];
        const seriesSet = new Set<string>();
        const lookup: Record<string, Record<string, number | null>> = {};
        for (const row of reportData) {
          const sv = row[seriesField] != null ? String(row[seriesField]) : '';
          if (!seriesSet.has(sv)) { seriesSet.add(sv); seriesOrder.push(sv); lookup[sv] = {}; }
          const lab = row[labelField] != null ? String(row[labelField]) : '';
          lookup[sv][lab] = toNum(row[valueField]);
        }
        const datasets = seriesOrder.map((sv) => ({
          label: `${valueField} (${sv})`,
          data: labelOrder.map((lab) => lookup[sv][lab] ?? null),
        }));
        return { labels: labelOrder, datasets };
      }
    }

    // Default path — one dataset per yField (no series breakout).
    const labels = reportData.map((row: any) => row[labelField] != null ? String(row[labelField]) : '');
    const datasets = (chartConfig.datasets || []).map((ds: any) => {
      const field = ds.field;
      if (!field) return ds; // Skip if no field specified

      const dataValues = reportData.map((row: any) => toNum(row[field]));

      // Build dataset with transformed data
      const result = { ...ds };
      delete result.field; // Remove field property
      result.data = dataValues;
      if (!result.label) result.label = field;

      return result;
    });

    return { labels, datasets };
  }

  function patchResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;

    try {
      const proto = ResizeObserver.prototype as any;
      if (proto.__rbPatched__) return;
      proto.__rbPatched__ = true;

      const origObserve = proto.observe;
      const origUnobserve = proto.unobserve;
      const origDisconnect = proto.disconnect;

      proto.observe = function (target: any) {
        try {
          if (target instanceof Element) {
            return origObserve.call(this, target);
          }
        } catch (err) {
          // swallow
        }
      };

      proto.unobserve = function (target: any) {
        try {
          if (target instanceof Element) {
            return origUnobserve.call(this, target);
          }
        } catch (err) {
          // swallow
        }
      };

      proto.disconnect = function () {
        try {
          return origDisconnect.call(this);
        } catch (err) {
          // swallow
        }
      };
    } catch (err) {
      // No-op
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Theme inheritance (framework-agnostic). A <canvas> can't use currentColor,
  // var() or color-mix, so we resolve concrete values from the host's computed
  // style + an OPTIONAL CSS-variable contract, then re-apply on theme change.
  // Fallbacks are neutral — NO daisyUI / Tailwind hardcoded here. A host MAY map
  // its own theme from outside:
  //   rb-chart { --rb-chart-grid: …; --rb-chart-palette: c1,c2,…; --rb-chart-accent: … }
  // ──────────────────────────────────────────────────────────────────────────
  const RB_DEFAULT_PALETTE = ['#509ee3', '#88bf4d', '#a989c5', '#ef8c8c', '#f9d45c', '#f2a86f', '#98d9d9', '#7172ad'];
  const RB_SINGLE_COLOR_TYPES = new Set(['bar', 'line', 'scatter', 'bubble', 'radar']);
  let _themeObserver: MutationObserver | null = null;

  // rgb()/rgba() → lower-alpha rgba; returns input unchanged for unparseable colors.
  function rbToAlpha(color: string, alpha: number): string {
    const m = color && color.match(/^rgba?\(([^)]+)\)/);
    if (!m) return color || `rgba(127,127,127,${alpha})`;
    const [r, g, b] = m[1].split(',').map((s) => s.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function rbReadThemeColors() {
    const cs = container ? getComputedStyle(container) : null;
    const text = (cs?.color || '').trim() || '#333';
    const v = (name: string) => (cs?.getPropertyValue(name) || '').trim();
    const grid = v('--rb-chart-grid') || rbToAlpha(text, 0.15);
    const pv = v('--rb-chart-palette');
    const palette = pv ? pv.split(',').map((s) => s.trim()).filter(Boolean) : RB_DEFAULT_PALETTE;
    const accent = v('--rb-chart-accent') || palette[0];
    return { text, grid, palette, accent };
  }

  // Inject inherited text/grid colors (always) + a palette for colourless datasets
  // (single-colour chart types only — pie/doughnut need per-slice arrays we don't touch).
  // Only fills values the caller/server config left undefined, so explicit colors win.
  function rbApplyThemeColors(cfg: any) {
    if (!cfg) return;
    const c = rbReadThemeColors();
    const o = (cfg.options = cfg.options || {});
    if (o.color === undefined) o.color = c.text;
    o.plugins = o.plugins || {};
    if (o.plugins.legend?.display !== false) {
      o.plugins.legend = o.plugins.legend || {};
      o.plugins.legend.labels = Object.assign({ color: c.text }, o.plugins.legend.labels);
    }
    o.plugins.title = Object.assign({ color: c.text }, o.plugins.title);
    o.scales = o.scales || { x: {}, y: {} };
    for (const k of Object.keys(o.scales)) {
      const sc = o.scales[k];
      if (!sc || typeof sc !== 'object') continue;
      sc.ticks = Object.assign({ color: c.text }, sc.ticks);
      sc.grid = Object.assign({ color: c.grid }, sc.grid);
      sc.border = Object.assign({ color: c.grid }, sc.border);
    }
    if (RB_SINGLE_COLOR_TYPES.has(cfg.type)) {
      (cfg.data?.datasets || []).forEach((ds: any, i: number) => {
        const col = c.palette[i % c.palette.length];
        if (ds.backgroundColor === undefined) ds.backgroundColor = cfg.type === 'line' ? rbToAlpha(col, 0.25) : col;
        if (ds.borderColor === undefined) ds.borderColor = col;
      });
    }
  }

  // Re-resolve + repaint when the host swaps theme (data-theme / class / style on <html>).
  function rbSetupThemeObserver() {
    if (_themeObserver || typeof MutationObserver === 'undefined') return;
    _themeObserver = new MutationObserver(() => {
      if (!chart) return;
      rbApplyThemeColors(chart.config);
      try { chart.update('none'); } catch { /* ignore */ }
    });
    _themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
  }

  function buildConfig() {
    const normalizedData = normalizeDataForChart(data);
    // Extract Chart.js options from chartConfig.options (DSL mode) or use props
    // chartConfig has structure: { type, labelField, datasets, options (Chart.js options) }
    let mergedOptions: any = { responsive };

    // First apply Chart.js options from chartConfig (DSL mode)
    if (chartConfig?.options) {
      mergedOptions = Object.assign({}, chartConfig.options, mergedOptions);
    }
    // Then apply any prop-based options (Angular mode)
    if (options && !chartConfig) {
      mergedOptions = Object.assign({}, options, mergedOptions);
    }

    const resolvedType = type || chartConfig?.type || (normalizedData?.datasets?.[0]?.type || 'line');

    // Special chart types — Chart.js doesn't render these natively from a plain
    // type string, so we transform the data/options here and dispatch the result.
    if (resolvedType === 'funnel')    return buildFunnelConfig(normalizedData, mergedOptions);
    if (resolvedType === 'row')       return buildRowConfig(normalizedData, mergedOptions);
    if (resolvedType === 'area')      return buildAreaConfig(normalizedData, mergedOptions);
    if (resolvedType === 'combo')     return buildComboConfig(normalizedData, mergedOptions);
    if (resolvedType === 'bubble')    return buildBubbleConfig(normalizedData, mergedOptions, data);
    if (resolvedType === 'boxplot')   return buildBoxPlotConfig(mergedOptions, data);
    if (resolvedType === 'waterfall') return buildWaterfallConfig(normalizedData, mergedOptions);

    return {
      type: resolvedType,
      data: normalizedData || { labels: [], datasets: [] },
      options: mergedOptions,
      plugins: plugins || [],
    } as any;
  }

  // Row — horizontal bar (axis flip).
  function buildRowConfig(normalizedData: any, mergedOptions: any) {
    return {
      type: 'bar',
      data: normalizedData || { labels: [], datasets: [] },
      options: Object.assign({}, mergedOptions, { indexAxis: 'y' }),
      plugins: plugins || [],
    } as any;
  }

  // Area — line with each dataset filled + Y-axis stacked.
  function buildAreaConfig(normalizedData: any, mergedOptions: any) {
    const datasets = (normalizedData?.datasets ?? []).map((ds: any) => Object.assign({}, ds, { fill: true }));
    const opts = Object.assign({}, mergedOptions, {
      scales: Object.assign({}, mergedOptions?.scales, {
        y: Object.assign({}, mergedOptions?.scales?.y, { stacked: true }),
      }),
    });
    return {
      type: 'line',
      data: { labels: normalizedData?.labels ?? [], datasets },
      options: opts,
      plugins: plugins || [],
    } as any;
  }

  // Combo — first dataset = bar, rest = line. Chart.js handles mixed natively.
  // `order` makes bars render under lines (lower order = drawn later = on top).
  function buildComboConfig(normalizedData: any, mergedOptions: any) {
    const datasets = (normalizedData?.datasets ?? []).map((ds: any, i: number) => Object.assign({}, ds, {
      type: i === 0 ? 'bar' : 'line',
      order: i === 0 ? 2 : 1,
      fill: false,
    }));
    return {
      type: 'bar',
      data: { labels: normalizedData?.labels ?? [], datasets },
      options: mergedOptions,
      plugins: plugins || [],
    } as any;
  }

  // Bubble — re-shape datasets into [{x, y, r}]. The radius comes from
  // `bubbleSizeField` if present in the chart config; otherwise constant.
  function buildBubbleConfig(normalizedData: any, mergedOptions: any, rawData: any) {
    const sizeField: string | undefined = chartConfig?.bubbleSizeField || mergedOptions?.bubbleSizeField;
    const constR: number = Number(mergedOptions?.bubbleSizeMin) || 6;

    // If we have raw rows, rebuild datasets so each point gets {x, y, r}.
    const reportRows: any[] = rawData?.reportData ?? (Array.isArray(rawData) ? rawData : []);
    const labels: any[] = normalizedData?.labels ?? [];

    const datasets = (normalizedData?.datasets ?? []).map((ds: any) => {
      const dataPoints = (ds.data ?? []).map((v: any, i: number) => {
        const xVal = labels[i] != null ? labels[i] : i;
        const yVal = typeof v === 'number' ? v : (v?.y != null ? Number(v.y) : Number(v));
        let rVal: number;
        if (typeof v === 'object' && v?.r != null) {
          rVal = Number(v.r);
        } else if (sizeField && reportRows[i] && reportRows[i][sizeField] != null) {
          rVal = Number(reportRows[i][sizeField]);
          if (!Number.isFinite(rVal)) rVal = constR;
        } else {
          rVal = constR;
        }
        return { x: xVal, y: yVal, r: Math.max(2, rVal) };
      });
      return Object.assign({}, ds, { data: dataPoints });
    });

    return {
      type: 'bubble',
      data: { datasets },
      options: mergedOptions,
      plugins: plugins || [],
    } as any;
  }

  // BoxPlot — needs raw rows grouped by xField. Each category becomes
  // `[v1, v2, v3, ...]`; the plugin computes quartiles/whiskers.
  function buildBoxPlotConfig(mergedOptions: any, rawData: any) {
    // Array-shaped options: xFields[0] is the X column, yFields[0] the metric.
    // Falls back to chartConfig.labelField / dataset field for DSL-driven renders.
    const xField: string = chartConfig?.labelField
      || (mergedOptions?.xFields && mergedOptions.xFields[0])
      || '';
    const yField: string = chartConfig?.datasets?.[0]?.field
      || (mergedOptions?.yFields && mergedOptions.yFields[0])
      || '';
    const reportRows: any[] = rawData?.reportData ?? (Array.isArray(rawData) ? rawData : []);

    if (!reportRows.length || !xField || !yField) {
      return { type: 'bar', data: { labels: [], datasets: [] }, options: mergedOptions, plugins: plugins || [] } as any;
    }

    const groups = new Map<string, number[]>();
    for (const r of reportRows) {
      const k = String(r[xField] ?? '');
      const v = Number(r[yField]);
      if (!Number.isFinite(v)) continue;
      let arr = groups.get(k);
      if (!arr) { arr = []; groups.set(k, arr); }
      arr.push(v);
    }
    const labels = [...groups.keys()];
    const data = labels.map((k) => groups.get(k) ?? []);

    return {
      type: 'boxplot',
      data: {
        labels,
        datasets: [{
          label: yField,
          data,
          backgroundColor: 'rgba(80,158,227,0.4)',
          borderColor: '#2171b5',
          borderWidth: 1,
        }],
      },
      options: mergedOptions,
      plugins: plugins || [],
    } as any;
  }

  // Waterfall — single-series cumulative deltas as stacked bar:
  //   floor (invisible) + delta (visible).
  function buildWaterfallConfig(normalizedData: any, mergedOptions: any) {
    const labels: any[] = normalizedData?.labels ?? [];
    const ds0 = normalizedData?.datasets?.[0] ?? { data: [] };
    const values: number[] = (ds0.data ?? []).map((v: unknown) => Number(v));

    const floors: number[] = [];
    const deltas: number[] = [];
    const colors: string[] = [];
    let running = 0;
    for (const v of values) {
      if (!Number.isFinite(v)) { floors.push(0); deltas.push(0); colors.push('#cccccc'); continue; }
      if (v >= 0) {
        floors.push(running);
        deltas.push(v);
        colors.push('#88bf4d');
      } else {
        floors.push(running + v);
        deltas.push(-v);
        colors.push('#ef8c8c');
      }
      running += v;
    }

    const opts = Object.assign({}, mergedOptions, {
      plugins: Object.assign({}, mergedOptions?.plugins, { legend: { display: false } }),
      scales: Object.assign({}, mergedOptions?.scales, {
        x: Object.assign({}, mergedOptions?.scales?.x, { stacked: true }),
        y: Object.assign({}, mergedOptions?.scales?.y, { stacked: true, beginAtZero: true }),
      }),
    });

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'floor', data: floors, backgroundColor: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0)', stack: 'wf' },
          { label: ds0.label || 'value', data: deltas, backgroundColor: colors, borderColor: colors, stack: 'wf' },
        ],
      },
      options: opts,
      plugins: plugins || [],
    } as any;
  }

  // Map a single-series dataset onto a horizontal bar with descending sort
  // and a uniform-tone fade. First step = 100%; subsequent rows show their %
  // of the first step in the tooltip.
  function buildFunnelConfig(normalizedData: any, mergedOptions: any) {
    const labels: string[] = (normalizedData?.labels ?? []).map((v: unknown) => String(v ?? ''));
    const ds = normalizedData?.datasets?.[0] ?? { data: [], label: '' };
    const values: (number | null)[] = (ds.data ?? []).map((v: unknown) => v == null ? null : Number(v));
    // Sort indices descending by numeric value (nulls last).
    const idx = values.map((_, i) => i).sort((a, b) => {
      const va = values[a] ?? -Infinity;
      const vb = values[b] ?? -Infinity;
      return vb - va;
    });
    const sortedLabels = idx.map((i) => labels[i] ?? '');
    const sortedValues = idx.map((i) => values[i]);
    const top = (sortedValues.find((v) => v != null && Number.isFinite(v)) as number | undefined) ?? 0;
    // Funnel palette — fades from saturated to muted as we descend.
    const palette = ['#509ee3', '#5fa9e6', '#74b6ec', '#8cc4f1', '#a3d2f7', '#bcdffc'];
    const bgColors = sortedValues.map((_, i) => palette[Math.min(i, palette.length - 1)]);

    const funnelOptions = Object.assign({}, mergedOptions, {
      indexAxis: 'y',
      plugins: Object.assign({}, mergedOptions?.plugins, {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item: any) => {
              const v = item.parsed?.x ?? item.raw;
              if (v == null || !Number.isFinite(v)) return String(v ?? '');
              const pct = top > 0 ? (v / top) * 100 : 0;
              return `${v.toLocaleString()} (${pct.toFixed(1)}% of top)`;
            },
          },
        },
      }),
      scales: Object.assign({}, mergedOptions?.scales, {
        x: { beginAtZero: true },
      }),
    });

    return {
      type: 'bar',
      data: {
        labels: sortedLabels,
        datasets: [{
          label: ds.label || 'value',
          data: sortedValues,
          backgroundColor: bgColors,
          borderColor: bgColors,
          borderWidth: 0,
        }],
      },
      options: funnelOptions,
      plugins: plugins || [],
    } as any;
  }

  function normalizeDataForChart(d: any) {
    // If it's already ChartJS config, use as-is
    if (!d) return { labels: [], datasets: [] };
    if (d.labels && d.datasets) return d;
    
    // Handle { chartConfig, reportData } format from DSL
    if (d.chartConfig && d.reportData && Array.isArray(d.reportData)) {
      return transformChartConfigToChartJS(d.chartConfig, d.reportData);
    }
    
    // If payload is a simple array of rows -> convert using heuristics
    if (Array.isArray(d)) {
      const rows = d;
      if (!rows || rows.length === 0) return { labels: [], datasets: [] };
      const cols = Object.keys(rows[0]);
      // try to find label column - prefer string values
      let labelCol = cols.find((c) => typeof rows[0][c] === 'string');
      if (!labelCol) labelCol = cols[0];
      // find numeric columns for series
      const seriesCols = cols.filter((c) => c !== labelCol && (typeof rows[0][c] === 'number' || !isNaN(Number(rows[0][c]))));
      // fallback: use second column as series
      if (seriesCols.length === 0 && cols.length > 1) seriesCols.push(cols[1]);
      const labels = rows.map((r) => (r[labelCol] == null ? '' : String(r[labelCol])));
      const datasets = seriesCols.map((col) => ({ label: col, data: rows.map((r) => { const v = r[col]; return v == null ? null : (typeof v === 'number' ? v : Number(v)); }) }));
      return { labels, datasets };
    }
    // If d is an object with data: rows or dataSpec, try to use its data property
    if (d.data && Array.isArray(d.data)) return normalizeDataForChart(d.data);
    // otherwise, fallback to empty chart data
    return { labels: [], datasets: [] };
  }

  // Tracks whether the BoxPlot controllers have been registered with Chart.js.
  // Done lazily on first boxplot render so we don't pay the import cost
  // for charts that never use it.
  let _boxplotRegistered = false;
  async function ensureBoxPlotRegistered(ChartCtor: any) {
    if (_boxplotRegistered) return;
    const bpMod: any = await import('@sgratzl/chartjs-chart-boxplot');
    ChartCtor.register(bpMod.BoxPlotController, bpMod.BoxAndWiskers);
    _boxplotRegistered = true;
  }

  async function createChart() {
    if (!canvas) return;

    try {
      const mod = await import('chart.js/auto');
      const ChartCtor = (mod as any).Chart || (mod as any).default || (mod as any);
      if (!ChartCtor) throw new Error('Chart.js module not found');

      const wantsBoxplot = (type || chartConfig?.type) === 'boxplot';
      if (wantsBoxplot) await ensureBoxPlotRegistered(ChartCtor);

      const config = buildConfig();
      rbApplyThemeColors(config);
      const ctx2d = canvas?.getContext('2d');
      if (!ctx2d) return;
      chart = new ChartCtor(ctx2d, config);
      lastChartType = config.type;
      rbSetupThemeObserver();
      dispatch('ready', { chart });

      // forward click events
      canvas.addEventListener('click', (evt: MouseEvent) => {
        try {
          if (!chart) return;
          const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false) || [];
          if (points.length) {
            const p = points[0];
            dispatch('chartClick', {
              event: evt,
              datasetIndex: p.datasetIndex,
              index: p.index,
              element: p,
            });
          }
        } catch (err) {
          // ignore
        }
      });
    } catch (err) {
      console.error('rb-chart init error', err);
      dispatch('initError', { message: String(err) });
    }
  }

  function destroyChart() {
    if (chart) {
      try {
        chart.destroy();
      } catch (err) {
        // ignore
      }
      chart = null;
      lastChartType = undefined;
    }
  }

  // allow external callers to update data/options via named exports
  export function updateChartData(newData: any) {
    data = newData;
    if (chart) {
      chart.config.data = data;
      try { chart.update(); } catch (err) { dispatch('chartError', { message: String(err) }); }
    }
  }

  export function updateChartOptions(newOptions: any) {
    options = newOptions;
    if (chart) {
      chart.config.options = Object.assign({}, chart.config.options || {}, newOptions);
      try { chart.update(); } catch (err) { dispatch('chartError', { message: String(err) }); }
    }
  }

  export function getChartInstance() {
    return chart;
  }

  onMount(async () => {
    patchResizeObserver();
    await tick();

    // Read attributes directly from host element (Svelte props may not be populated yet)
    // Navigate from container up through shadow DOM to host element
    const shadowRoot = container?.getRootNode();
    const hostEl = (shadowRoot as ShadowRoot)?.host;
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
      if (!testMode) {
        const tm = hostEl.getAttribute('test-mode');
        if (tm === 'true' || tm === '') testMode = true;
      }
    }

    if (!container) {
      dispatch('initError', { message: 'Missing container element' });
      return;
    }

    // ========================================================================
    // Hybrid Mode: if reportId provided, self-fetch config + data
    // ========================================================================
    if (reportId && apiBaseUrl) {
      selfFetchLoading = true;
      error = null;
      
      const headers: Record<string, string> = {};
      // TEMP: API key disabled for rollback
      // if (apiKey) headers['X-API-Key'] = apiKey;
      
      try {
        // Fetch config (deduplicated across all rb-chart instances with same report-id)
        const config = await fetchConfigCached(`${apiBaseUrl}/reports/${reportId}/config`, headers);
        
        // Store full chart configuration from DSL (named or default)
        if (componentId && config.namedChartOptions?.[componentId]) {
          chartConfig = config.namedChartOptions[componentId];
        } else if (config.chartOptions) {
          chartConfig = config.chartOptions;
        }
        if (chartConfig?.type) type = chartConfig.type;

        // Store raw DSL for Configuration tab display
        if (config.chartDsl) {
          configDsl = config.chartDsl;
        }

        // Fetch data (GET with user params + testMode + componentId)
        const dataQueryParams = new URLSearchParams(reportParams as Record<string, string>);
        if (testMode) dataQueryParams.set('testMode', 'true');
        if (componentId) dataQueryParams.set('componentId', componentId);
        const dataQs = dataQueryParams.toString();
        const dataUrl = dataQs
            ? `${apiBaseUrl}/reports/${reportId}/data?${dataQs}`
            : `${apiBaseUrl}/reports/${reportId}/data`;
        const dataRes = await fetch(dataUrl, { headers });
        if (!dataRes.ok) throw new Error(`Data fetch failed: ${dataRes.status}`);
        const dataResult = await dataRes.json();
        // Backend returns { data: [...] }, extract the array
        const reportData = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

        // Transform data using chartConfig (which contains datasets with field mappings)
        if (chartConfig && reportData) {
          data = transformChartConfigToChartJS(chartConfig, reportData);
        }

        // Dispatch events for config and data loaded
        dispatch('configLoaded', { configDsl, config });
        dispatch('dataFetched', {
          data: reportData,
          executionTimeMillis: dataResult?.executionTimeMillis || 0,
          totalRows: dataResult?.totalRows || reportData.length,
          truncated: dataResult?.truncated || false,
          reportColumnNames: dataResult?.reportColumnNames || [],
        });

      } catch (err: any) {
        error = err.message || 'Failed to load report';
        console.error('rb-chart self-fetch error:', err);
        dispatch('fetchError', { message: error });
        selfFetchLoading = false;
        return;
      }
      selfFetchLoading = false;
    }

    // apply width/height if provided
    if (width) container.style.width = String(width);
    if (height) container.style.height = String(height);

    await createChart();
  });

  afterUpdate(async () => {
    _afterUpdateCount++;
    const now = Date.now();
    // Log at most once per second
    if (now - _lastAfterUpdateLogTime > 1000) {
      // console.log('[DEBUG] rb-chart afterUpdate called', _afterUpdateCount, 'times total');
      _lastAfterUpdateLogTime = now;
    }
    // Warn if called excessively
    if (_afterUpdateCount > 100 && _afterUpdateCount % 100 === 0) {
      console.warn('[DEBUG] WARNING: rb-chart afterUpdate called', _afterUpdateCount, 'times - possible infinite loop!');
    }
    
    // naive update logic: if chart type changed, rebuild chart; otherwise update data/options
    try {
      const newType = type || chartConfig?.type || (data?.datasets?.[0]?.type);
      if (chart && lastChartType !== newType) {
        // rebuild chart
        destroyChart();
        await createChart();
        return;
      }

      if (chart) {
        // update datasets and labels in-place to preserve animation and scales
        const normalizedData = normalizeDataForChart(data);
        chart.config.data = normalizedData || chart.config.data;
        
        // Merge Chart.js options - preserve existing, apply chartConfig (DSL) or options (Angular)
        let mergedOptions: any = Object.assign({}, chart.config.options || {});
        if (chartConfig?.options) {
          // DSL mode: use chartConfig.options
          mergedOptions = Object.assign({}, chartConfig.options, mergedOptions);
        } else if (options) {
          // Canvas/Angular mode: incoming options win over stale chart state
          mergedOptions = Object.assign({}, mergedOptions, options);
        }
        chart.config.options = mergedOptions;
        rbApplyThemeColors(chart.config);

        try { chart.update(); } catch (err) { dispatch('chartError', { message: String(err) }); }
      }
    } catch (err) {
      console.error('rb-chart update error', err);
      dispatch('chartError', { message: String(err) });
    }
  });

  onDestroy(() => {
    if (_themeObserver) { _themeObserver.disconnect(); _themeObserver = null; }
    destroyChart();
  });

  // Public method to fetch data with parameters (for use after initial load)
  export async function fetchData(params: Record<string, any> = {}) {
    if (!reportId || !apiBaseUrl) {
      console.warn('rb-chart: fetchData requires reportId and apiBaseUrl');
      return;
    }
    
    selfFetchLoading = true;
    const headers: Record<string, string> = {};
    // TEMP: API key disabled for rollback
    // if (apiKey) headers['X-API-Key'] = apiKey;
    
    try {
      // Re-fetch config (uses module-level dedup cache)
      const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
      const config = await fetchConfigCached(configUrl, headers);
      
      // Update chartConfig from fresh config (named or default)
      if (componentId && config.namedChartOptions?.[componentId]) {
        chartConfig = config.namedChartOptions[componentId];
      } else if (config.chartOptions) {
        chartConfig = config.chartOptions;
      }
      if (chartConfig?.type) type = chartConfig.type;

      // Update raw DSL for Configuration tab
      if (config.chartDsl) {
        configDsl = config.chartDsl;
      }

      // Build query string from params (merge reportParams + caller params)
      const mergedParams = new URLSearchParams({ ...reportParams, ...params } as Record<string, string>);
      if (testMode) mergedParams.set('testMode', 'true');
      if (componentId) mergedParams.set('componentId', componentId);
      const queryString = mergedParams.toString();
      const url = queryString
        ? `${apiBaseUrl}/reports/${reportId}/data?${queryString}`
        : `${apiBaseUrl}/reports/${reportId}/data`;
      
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
      const dataResult = await res.json();
      // Backend returns { data: [...] }, extract the array
      const reportData = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);
      
      // Transform data using updated chartConfig
      if (chartConfig && reportData) {
        data = transformChartConfigToChartJS(chartConfig, reportData);
      }
      
      // Rebuild chart to apply new config (options like title, scales, etc.)
      destroyChart();
      await createChart();
      
      dispatch('dataFetched', {
        data: reportData,
        executionTimeMillis: dataResult?.executionTimeMillis || 0,
        totalRows: dataResult?.totalRows || reportData.length,
        truncated: dataResult?.truncated || false,
        reportColumnNames: dataResult?.reportColumnNames || [],
      });
    } catch (err: any) {
      error = err.message || 'Failed to fetch data';
      dispatch('fetchError', { message: error });
    }
    selfFetchLoading = false;
  }
</script>

<style>
  :host {
    display: block;
    position: relative;
    width: 100%;
  }
  .rb-chart-root { 
    width: 100%; 
    position: relative; 
  }
  /* Let Chart.js control canvas sizing when responsive/maintainAspectRatio are set */
  canvas { 
    display: block; 
  }
  .rb-chart-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; background: rgba(255,255,255,0.6);
  }
  .rb-chart-spinner {
    width: 32px; height: 32px; border: 4px solid #ddd; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite;
  }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .rb-loading {
    padding: 1rem;
    text-align: center;
    color: #666;
  }
  .rb-error {
    padding: 1rem;
    text-align: center;
    color: #dc3545;
    background: #fff5f5;
    border: 1px solid #dc3545;
    border-radius: 4px;
  }
</style>

{#if selfFetchLoading}
  <div class="rb-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading...</div>
{/if}
{#if error}
  <div class="rb-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div class="rb-chart-root" bind:this={container} id={componentId ? `widgetChart-${componentId}` : undefined} style:display={selfFetchLoading || error ? 'none' : 'block'}>
  {#if loading}
    <div class="rb-chart-overlay"><div class="rb-chart-spinner"></div></div>
  {/if}
  <canvas bind:this={canvas}></canvas>
</div>

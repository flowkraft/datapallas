<svelte:options customElement="rb-pivot-table" accessors={true} />

<script lang="ts">
  import { onMount, afterUpdate, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { PivotData, aggregators as defaultAggregators, getSort, sortAs, naturalSort } from './services/pivot-data';
  import { 
    renderPivotTableHTML, 
    renderPivotTableTSV,
    getChartConfigForRenderer,
    renderers,
    rendererNames,
    tableRendererNames,
    chartRendererNames,
    type RendererInfo
  } from './services/pivot-renderers';
  import type {
    PivotTableProps,
    PivotTableState,
    ValueFilter,
    SortOrder,
    AggregatorFactory,
    TableClickCallback,
    PivotEngine
  } from './services/pivot-types';
  import { pivotApi, buildServerPivotRequest } from './services/pivot-api';
  import type { ServerPivotResponse } from './services/pivot-api';

  // ============================================================================
  // Derived Attribute Expression Parser
  // Converts string expressions (from JSON config) to JS functions.
  // Supports: dateFormat(fieldName, "formatStr")
  //   %Y = 4-digit year, %y = 2-digit year, %m = month (01-12),
  //   %d = day (01-31), %q = quarter (1-4)
  // ============================================================================
  function parseDerivedAttributeExpressions(
    raw: Record<string, any>
  ): Record<string, (record: Record<string, any>) => any> {
    const result: Record<string, (record: Record<string, any>) => any> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'function') {
        result[key] = value;
      } else if (typeof value === 'string') {
        const match = value.match(/^dateFormat\((\w+),\s*"([^"]+)"\)$/);
        if (match) {
          const field = match[1];
          const fmt = match[2];
          result[key] = (record: Record<string, any>) => {
            const dateStr = record[field];
            if (!dateStr) return null;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return fmt
              .replace('%Y', String(d.getFullYear()))
              .replace('%y', String(d.getFullYear()).slice(-2))
              .replace('%m', String(d.getMonth() + 1).padStart(2, '0'))
              .replace('%d', String(d.getDate()).padStart(2, '0'))
              .replace('%q', String(Math.ceil((d.getMonth() + 1) / 3)));
          };
        }
      }
    }
    return result;
  }

  // ============================================================================
  // Sorters Config Parser
  // Converts array values from JSON config to sortAs() functions.
  // JSON sends { region: ["West", "Central", "East"] } but the component
  // expects { region: sortAs(["West", "Central", "East"]) }.
  // ============================================================================
  function parseSortersFromConfig(raw: Record<string, any>): any {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'function') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = sortAs(value);
      }
    }
    return result;
  }

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
  // Pivot Table Configuration Props
  // ============================================================================
  
  export let data: Record<string, any>[] = [];
  export let rows: string[] = [];
  export let cols: string[] = [];
  export let vals: string[] = [];
  export let aggregatorName: string = 'Count';
  export let rendererName: string = 'Table';
  /** Show the rightmost per-row "Totals" column (default on). */
  export let rowTotals: boolean = true;
  /** Show the grand-totals row at the bottom (default on). */
  export let colTotals: boolean = true;
  export let valueFilter: ValueFilter = {};
  export let sorters: any = {};
  export let derivedAttributes: Record<string, (record: Record<string, any>) => any> = {};
  export let rowOrder: SortOrder = 'key_a_to_z';
  export let colOrder: SortOrder = 'key_a_to_z';
  export let hiddenAttributes: string[] = [];
  export let hiddenFromAggregators: string[] = [];
  export let hiddenFromDragDrop: string[] = [];
  export let unusedOrientationCutoff: number = 85;
  export let menuLimit: number = 500;
  // New props for extensibility
  export let aggregators: Record<string, AggregatorFactory> = {};
  export let tableClickCallback: TableClickCallback | null = null;

  // Server-side processing - engine mode is auto-detected by backend from datasource config
  // "browser" = download all data, aggregate client-side
  // "duckdb" or "clickhouse" = aggregate server-side, only send results
  export let engine: PivotEngine = 'browser';


  // ============================================================================
  // Internal state for self-fetch mode
  // ============================================================================
  let loading = false;
  let error: string | null = null;

  // Raw DSL source code (exposed for Configuration tab)
  export let configDsl: string = '';

  // Server-side pivot response metadata
  let serverMetadata: ServerPivotResponse['metadata'] | null = null;

  // ============================================================================
  // Internal State
  // ============================================================================
  
  let container: HTMLDivElement;
  let outputContainer: HTMLDivElement;
  let chartCanvas: HTMLCanvasElement;
  let chartInstance: any = null;
  
  // Materialized data
  let attrValues: Record<string, Record<string, number>> = {};
  let materializedInput: Record<string, any>[] = [];
  
  // UI State
  let unusedOrder: string[] = [];
  let zIndices: Record<string, number> = {};
  let maxZIndex = 1000;
  let openDropdown: string | false = false;
  let openFilterBox: string | null = null;
  let filterText: string = '';
  
  // Drag state
  let draggedAttr: string | null = null;

  const dispatch = createEventDispatcher();

  // ============================================================================
  // Sort Icons
  // ============================================================================
  
  const sortIcons: Record<SortOrder, { rowSymbol: string; colSymbol: string; next: SortOrder }> = {
    'key_a_to_z': { rowSymbol: '↕', colSymbol: '↔', next: 'value_a_to_z' },
    'value_a_to_z': { rowSymbol: '↓', colSymbol: '→', next: 'value_z_to_a' },
    'value_z_to_a': { rowSymbol: '↑', colSymbol: '←', next: 'key_a_to_z' },
  };

  // ============================================================================
  // Computed Values
  // ============================================================================
  
  // Merge default aggregators with custom ones (custom overrides default)
  $: mergedAggregators = { ...defaultAggregators, ...aggregators };
  
  $: allAttrs = Object.keys(attrValues);
  
  $: unusedAttrs = allAttrs
    .filter(e => !rows.includes(e) && !cols.includes(e) && !hiddenAttributes.includes(e) && !hiddenFromDragDrop.includes(e))
    .sort(sortAs(unusedOrder));
  
  $: visibleRows = rows.filter(e => !hiddenAttributes.includes(e) && !hiddenFromDragDrop.includes(e));
  $: visibleCols = cols.filter(e => !hiddenAttributes.includes(e) && !hiddenFromDragDrop.includes(e));
  
  $: unusedLength = unusedAttrs.reduce((r, e) => r + e.length, 0);
  $: horizUnused = unusedLength < unusedOrientationCutoff;
  
  $: aggregatorOptions = Object.keys(mergedAggregators);
  
  $: numValsAllowed = mergedAggregators[aggregatorName]?.([])?.()?.numInputs || 0;
  
  $: valOptions = allAttrs.filter(e => !hiddenAttributes.includes(e) && !hiddenFromAggregators.includes(e));
  
  $: rendererInfo = renderers[rendererName] || renderers['Table'];
  $: isTableRenderer = rendererInfo.type === 'table';
  $: isChartRenderer = rendererInfo.type === 'chart';

  // ============================================================================
  // PivotData Computation
  // ============================================================================

  $: pivotData = new PivotData({
    data: materializedInput,
    aggregators: mergedAggregators,
    aggregatorName,
    cols,
    rows,
    vals,
    valueFilter,
    sorters,
    derivedAttributes,
    rowOrder,
    colOrder,
  });

  // ============================================================================
  // Server-side Processing (Auto-Detect or Explicit Engine)
  // ============================================================================

  // Helper to determine if server-side processing should be used
  // Server-side is used when reportId is available AND engine is duckdb/clickhouse
  function shouldUseServerProcessing(): boolean {
    return engine !== 'browser' && !!reportId;
  }

  // Reactive statement to trigger server-side pivot when conditions are met.
  // Dependencies must be inlined — Svelte can't see inside function calls.
  // Re-fires on any pivot parameter change so server re-aggregates.
  // Debounced to avoid rapid cancellations during config loading.
  let _serverPivotTimer: any = null;
  $: if (engine !== 'browser' && reportId && rows && cols && vals && aggregatorName && rowOrder && colOrder) {
    clearTimeout(_serverPivotTimer);
    _serverPivotTimer = setTimeout(() => executePivotOnServer(), 150);
  }

  async function executePivotOnServer() {
    if (!reportId) {
      error = 'reportId is required for server-side processing';
      return;
    }

    loading = true;
    error = null;
    serverMetadata = null;

    try {
      // Server resolves connectionCode + tableName from reportId internally
      const engineToUse = engine as 'duckdb' | 'clickhouse' | undefined;

      const request = buildServerPivotRequest(reportId, {
        rows,
        cols,
        vals,
        aggregatorName,
        valueFilter,
        rowOrder,
        colOrder,
      }, engineToUse);

      // Derive analytics API URL from apiBaseUrl; use origin so we don't depend on its exact path.
      if (apiBaseUrl) {
        try {
          const origin = new URL(apiBaseUrl, window.location.href).origin;
          pivotApi.baseUrl = `${origin}/api/analytics`;
        } catch (e) {
          console.warn('[rb-pivot-table] Could not derive analytics URL from apiBaseUrl:', apiBaseUrl, e);
        }
      }

      // console.log('[rb-pivot-table] Executing server-side pivot:', request);
      const response = await pivotApi.executePivot(request, `pivot-${reportId}`);

      // Check if backend returned 'browser' engine (non-OLAP connection)
      if ((response as any).engine === 'browser') {
        // console.log('[rb-pivot-table] Backend detected non-OLAP connection, switching to browser processing');
        dispatch('pivotEngineDetected', { detectedEngine: 'browser' });
        loading = false;
        return;
      }

      // console.log('[rb-pivot-table] Server response received:', {
      //   rowCount: response.metadata.rowCount,
      //   executionTimeMs: response.metadata.executionTimeMs,
      //   aggregator: response.metadata.aggregatorUsed,
      // });

      // Inject missing columns so PivotData discovers all draggable fields.
      // Server returns only GROUP BY dimensions + aggregated value, but the source
      // table has more columns (continent, employee_name, etc.) that users can drag.
      const serverData = response.data;
      const availableCols = response.metadata.availableColumns;
      if (availableCols && availableCols.length > 0 && serverData.length > 0) {
        const existingKeys = new Set(Object.keys(serverData[0]));
        const missingCols = availableCols.filter(c => !existingKeys.has(c));
        if (missingCols.length > 0) {
          for (const row of serverData) {
            for (const col of missingCols) {
              row[col] = null;
            }
          }
        }
      }

      // Update data with server results
      data = serverData;
      serverMetadata = response.metadata;

      dispatch('pivotExecuted', { metadata: serverMetadata });

    } catch (err: any) {
      error = err.message || 'Failed to execute server-side pivot';
      console.error('[rb-pivot-table] Server-side pivot error:', err);
      dispatch('error', { message: error });
    } finally {
      loading = false;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Fetch with timeout to prevent hanging on slow/unreachable backends
   */
  async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================
  
  onMount(async () => {
    await tick();
    injectStyles();
    
    // Read attributes directly from host element (Svelte props may not be populated yet)
    // Navigate from container up through shadow DOM to host element
    const shadowRoot = container?.getRootNode();
    const hostEl = (shadowRoot as ShadowRoot)?.host;
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
      if (!testMode) {
        const tm = hostEl.getAttribute('test-mode');
        if (tm === 'true' || tm === '') testMode = true;
      }
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
    }
    
    // ========================================================================
    // Hybrid Mode: if reportId provided, self-fetch config + optionally data
    // ========================================================================
    if (reportId && apiBaseUrl) {
      loading = true;
      error = null;

      const headers: Record<string, string> = {};
      // TEMP: API key disabled for rollback
      // if (apiKey) headers['X-API-Key'] = apiKey;

      try {
        // Fetch config (deduplicated across all rb-pivot-table instances with same report-id)
        // console.log('[rb-pivot-table] Fetching config from:', `${apiBaseUrl}/reports/${reportId}/config`);
        const config = await fetchConfigCached(`${apiBaseUrl}/reports/${reportId}/config`, headers);
        // console.log('[rb-pivot-table] Config received:', {
        //   hasPivotTable: config.hasPivotTable,
        //   pivotTableDsl: config.pivotTableDsl ? `${config.pivotTableDsl.length} chars` : 'MISSING',
        //   pivotTableOptions: config.pivotTableOptions
        // });

        // Apply pivot table options from config (named or default)
        const pivotOpts = (componentId && config.namedPivotTableOptions?.[componentId])
          ? config.namedPivotTableOptions[componentId]
          : config.pivotTableOptions;
        if (pivotOpts) {
          const opts = pivotOpts;
          if (opts.rows) rows = opts.rows;
          if (opts.cols) cols = opts.cols;
          if (opts.vals) vals = opts.vals;
          if (opts.aggregatorName) aggregatorName = opts.aggregatorName;
          if (opts.rendererName) rendererName = opts.rendererName;
          if (opts.valueFilter) valueFilter = opts.valueFilter;
          if (opts.rowOrder) rowOrder = opts.rowOrder;
          if (opts.colOrder) colOrder = opts.colOrder;
          if (opts.hiddenAttributes) hiddenAttributes = opts.hiddenAttributes;
          if (opts.hiddenFromAggregators) hiddenFromAggregators = opts.hiddenFromAggregators;
          if (opts.hiddenFromDragDrop) hiddenFromDragDrop = opts.hiddenFromDragDrop;
          if (opts.unusedOrientationCutoff != null) unusedOrientationCutoff = opts.unusedOrientationCutoff;
          if (opts.menuLimit != null) menuLimit = opts.menuLimit;
          if (opts.derivedAttributes) derivedAttributes = parseDerivedAttributeExpressions(opts.derivedAttributes);
          if (opts.sorters) sorters = parseSortersFromConfig(opts.sorters);
        }

        // Apply engine mode from backend auto-detection
        if (config.pivotEngineMode) {
          engine = config.pivotEngineMode as PivotEngine;
          // console.log('[rb-pivot-table] Backend detected engine mode:', engine);
        }

        // Store raw DSL for Configuration tab display
        if (config.pivotTableDsl) {
          configDsl = config.pivotTableDsl;
          // console.log('[rb-pivot-table] configDsl set, length:', configDsl.length);
        } else {
          console.warn('[rb-pivot-table] No pivotTableDsl in config response!');
        }

        // Decide whether to fetch full data from /data endpoint:
        // - Browser mode: always fetch all rows (client-side aggregation)
        // - DuckDB/ClickHouse: skip fetch, server-side aggregation via /api/analytics/pivot
        const needsDataFetch = engine === 'browser' || !shouldUseServerProcessing();
        if (needsDataFetch) {
          // console.log('[rb-pivot-table]', engine, 'mode: fetching dataset from /data endpoint...');
          // Build data URL with user params + testMode + componentId
          const dataQueryParams = new URLSearchParams(reportParams as Record<string, string>);
          if (testMode) dataQueryParams.set('testMode', 'true');
          if (componentId) dataQueryParams.set('componentId', componentId);
          const dataQs = dataQueryParams.toString();
          const dataFetchUrl = dataQs
              ? `${apiBaseUrl}/reports/${reportId}/data?${dataQs}`
              : `${apiBaseUrl}/reports/${reportId}/data`;
          // Longer timeout (60s) because backend may process multiple requests sequentially
          const dataRes = await fetchWithTimeout(dataFetchUrl, { headers }, 60000);
          if (!dataRes.ok) throw new Error(`Data fetch failed: ${dataRes.status}`);
          const dataResult = await dataRes.json();
          // Backend returns { data: [...] }, extract the array
          data = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

          // Check if backend returned an error payload (ClickHouse unavailable, SQL error, etc.)
          if (data && data.length === 1 && data[0].ERROR_MESSAGE) {
            error = data[0].ERROR_MESSAGE;
            dispatch('error', { message: error });
            loading = false;
            return;
          }

          dispatch('dataFetched', {
            data,
            executionTimeMillis: dataResult?.executionTimeMillis || 0,
            totalRows: dataResult?.totalRows || data.length,
            truncated: dataResult?.truncated || false,
            reportColumnNames: dataResult?.reportColumnNames || [],
          });
        } else {
          // console.log('[rb-pivot-table] Server-side aggregation mode (', engine, '): skipping data download, will aggregate on server');
          // Server-side aggregation will happen via reactive statement when user interacts
        }

        // Dispatch event so host page knows config is ready
        dispatch('configLoaded', { configDsl, config });

      } catch (err: any) {
        error = err.message || 'Failed to load report';
        console.error('rb-pivot-table self-fetch error:', err);
        dispatch('error', { message: error });
        loading = false;
        return;
      }
      loading = false;
    }

    materializeInput(data);
  });

  afterUpdate(() => {
    renderOutput();
  });

  onDestroy(() => {
    destroyChart();
  });

  // ============================================================================
  // Data Materialization
  // ============================================================================
  
  function materializeInput(nextData: any) {
    const newAttrValues: Record<string, Record<string, number>> = {};
    const newMaterializedInput: Record<string, any>[] = [];
    let recordsProcessed = 0;

    PivotData.forEachRecord(nextData, derivedAttributes, (record) => {
      newMaterializedInput.push(record);
      
      for (const attr of Object.keys(record)) {
        if (!(attr in newAttrValues)) {
          newAttrValues[attr] = {};
          if (recordsProcessed > 0) {
            newAttrValues[attr]['null'] = recordsProcessed;
          }
        }
      }
      
      for (const attr in newAttrValues) {
        const value = attr in record ? String(record[attr]) : 'null';
        if (!(value in newAttrValues[attr])) {
          newAttrValues[attr][value] = 0;
        }
        newAttrValues[attr][value]++;
      }
      
      recordsProcessed++;
    });

    attrValues = newAttrValues;
    materializedInput = newMaterializedInput;
  }

  // Watch for data changes
  $: if (data) {
    materializeInput(data);
  }

  // ============================================================================
  // Rendering
  // ============================================================================
  
  function renderOutput() {
    if (!outputContainer) return;
    
    try {
      if (isTableRenderer) {
        destroyChart();
        const html = renderPivotTableHTML(pivotData, {
          heatmapMode: rendererInfo.heatmapMode,
          clickable: !!tableClickCallback,
          showRowTotals: rowTotals,
          showColTotals: colTotals,
        });
        outputContainer.innerHTML = html;
        
        // Wire up click handling if callback provided
        if (tableClickCallback) {
          setupTableClickHandler();
        }
      } else if (isChartRenderer) {
        renderChart();
      }
    } catch (err) {
      console.error('rb-pivot-table render error:', err);
      outputContainer.innerHTML = `<div class="pvtError">Error rendering: ${err}</div>`;
    }
  }
  
  function setupTableClickHandler() {
    if (!outputContainer || !tableClickCallback) return;
    
    const clickableCells = outputContainer.querySelectorAll('.pvtClickable');
    clickableCells.forEach((cell) => {
      cell.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const row = target.dataset.row || '';
        const col = target.dataset.col || '';
        const value = target.dataset.value || '';
        tableClickCallback!({ row, col, value }, e as MouseEvent);
      });
    });
  }

  async function renderChart() {
    if (!outputContainer) return;
    
    // Ensure canvas exists
    if (!chartCanvas) {
      outputContainer.innerHTML = '<canvas></canvas>';
      chartCanvas = outputContainer.querySelector('canvas')!;
      if (!chartCanvas) return;
    }

    const config = getChartConfigForRenderer(rendererName, pivotData);
    
    try {
      const mod = await import('chart.js/auto');
      const ChartCtor = (mod as any).Chart || (mod as any).default || mod;
      
      if (chartInstance) {
        // Update existing chart
        chartInstance.config.type = config.type;
        chartInstance.config.data = config.data;
        chartInstance.config.options = config.options;
        chartInstance.update();
      } else {
        // Create new chart
        const ctx2d = chartCanvas?.getContext('2d');
        if (!ctx2d) return;
        chartInstance = new ChartCtor(ctx2d, config);
      }
    } catch (err) {
      console.error('Chart.js error:', err);
      outputContainer.innerHTML = `<div class="pvtError">Chart error: ${err}</div>`;
    }
  }

  function destroyChart() {
    if (chartInstance) {
      try { chartInstance.destroy(); } catch (e) {}
      chartInstance = null;
      chartCanvas = null as any;
    }
  }

  // ============================================================================
  // State Update & onChange
  // ============================================================================
  
  function emitChange() {
    const state: PivotTableState = {
      rows,
      cols,
      vals,
      aggregatorName,
      rendererName,
      valueFilter,
      rowOrder,
      colOrder,
    };
    dispatch('change', state);
  }

  function setRenderer(name: string) {
    rendererName = name;
    openDropdown = false;
    emitChange();
  }

  function setAggregator(name: string) {
    aggregatorName = name;
    openDropdown = false;
    emitChange();
  }

  function setVal(index: number, value: string) {
    vals = [...vals.slice(0, index), value, ...vals.slice(index + 1)];
    openDropdown = false;
    emitChange();
  }

  function toggleRowOrder() {
    rowOrder = sortIcons[rowOrder].next;
    emitChange();
  }

  function toggleColOrder() {
    colOrder = sortIcons[colOrder].next;
    emitChange();
  }

  // ============================================================================
  // Filter Box
  // ============================================================================
  
  function toggleFilterBox(attr: string) {
    if (openFilterBox === attr) {
      openFilterBox = null;
    } else {
      openFilterBox = attr;
      filterText = '';
      moveToTop(attr);
    }
  }

  function moveToTop(attr: string) {
    maxZIndex++;
    zIndices = { ...zIndices, [attr]: maxZIndex };
  }

  function matchesFilter(x: string): boolean {
    return x.toLowerCase().trim().includes(filterText.toLowerCase().trim());
  }

  function toggleValue(attr: string, value: string) {
    const newFilter = { ...valueFilter };
    if (!newFilter[attr]) newFilter[attr] = {};
    
    if (value in newFilter[attr]) {
      delete newFilter[attr][value];
      if (Object.keys(newFilter[attr]).length === 0) {
        delete newFilter[attr];
      }
    } else {
      newFilter[attr][value] = true;
    }
    
    valueFilter = newFilter;
    emitChange();
  }

  function selectOnly(attr: string, value: string) {
    const allValues = Object.keys(attrValues[attr] || {});
    const newFilter = { ...valueFilter };
    newFilter[attr] = {};
    
    for (const v of allValues) {
      if (v !== value) {
        newFilter[attr][v] = true;
      }
    }
    
    valueFilter = newFilter;
    emitChange();
  }

  function selectAllFiltered(attr: string) {
    const allValues = Object.keys(attrValues[attr] || {}).filter(matchesFilter);
    const newFilter = { ...valueFilter };
    delete newFilter[attr];
    valueFilter = newFilter;
    emitChange();
  }

  function deselectAllFiltered(attr: string) {
    const allValues = Object.keys(attrValues[attr] || {}).filter(matchesFilter);
    const newFilter = { ...valueFilter };
    if (!newFilter[attr]) newFilter[attr] = {};
    
    for (const v of allValues) {
      newFilter[attr][v] = true;
    }
    
    valueFilter = newFilter;
    emitChange();
  }

  function isValueFiltered(attr: string, value: string): boolean {
    return !!valueFilter[attr]?.[value];
  }

  function hasActiveFilter(attr: string): boolean {
    return Object.keys(valueFilter[attr] || {}).length > 0;
  }

  // ============================================================================
  // Drag and Drop
  // ============================================================================
  
  function onDragStart(e: DragEvent, attr: string) {
    draggedAttr = attr;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', attr);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function onDropRows(e: DragEvent) {
    e.preventDefault();
    if (!draggedAttr) return;

    moveDimension(draggedAttr, 'rows');  // Use the public API
    draggedAttr = null;
  }

  function onDropCols(e: DragEvent) {
    e.preventDefault();
    if (!draggedAttr) return;

    moveDimension(draggedAttr, 'cols');  // Use the public API
    draggedAttr = null;
  }

  function onDropUnused(e: DragEvent) {
    e.preventDefault();
    if (!draggedAttr) return;

    moveDimension(draggedAttr, 'unused');  // Use the public API
    draggedAttr = null;
  }

  function removeFromRows(attr: string) {
    rows = rows.filter(r => r !== attr);
    emitChange();
  }

  function removeFromCols(attr: string) {
    cols = cols.filter(c => c !== attr);
    emitChange();
  }

  // ============================================================================
  // Public API for programmatic dimension movement (for tests)
  // ============================================================================

  /**
   * Move a dimension to a specific drop zone programmatically.
   * This is the SAME logic that onDropRows/onDropCols/onDropUnused use.
   * @param dimension - Name of the dimension to move
   * @param targetZone - Where to move it: 'rows', 'cols', or 'unused'
   */
  export function moveDimension(dimension: string, targetZone: 'rows' | 'cols' | 'unused'): void {
    switch (targetZone) {
      case 'rows':
        // Remove from cols if present
        cols = cols.filter(c => c !== dimension);
        // Add to rows if not already there
        if (!rows.includes(dimension)) {
          rows = [...rows, dimension];
        }
        break;

      case 'cols':
        // Remove from rows if present
        rows = rows.filter(r => r !== dimension);
        // Add to cols if not already there
        if (!cols.includes(dimension)) {
          cols = [...cols, dimension];
        }
        break;

      case 'unused':
        // Remove from both
        rows = rows.filter(r => r !== dimension);
        cols = cols.filter(c => c !== dimension);
        break;
    }

    // Trigger re-render
    emitChange();
  }

  /**
   * Change the value field programmatically.
   * This is the SAME logic that the dropdown click handler uses.
   * @param valueName - Name of the value field to select (e.g., 'Revenue', 'Profit')
   */
  export function changeValueField(valueName: string): void {
    // Find the index of the first value slot (usually 0 for single-value pivots)
    const index = 0;
    // Call the internal setVal function
    vals = [...vals.slice(0, index), valueName, ...vals.slice(index + 1)];
    openDropdown = false;
    emitChange();
  }

  /**
   * Change the aggregator programmatically.
   * @param newAggregator - Name of the aggregator (e.g., 'Sum', 'Average', 'Count')
   */
  export function changeAggregator(newAggregator: string): void {
    aggregatorName = newAggregator;
    emitChange();
  }

  /**
   * Change the renderer programmatically.
   * @param newRenderer - Name of the renderer (e.g., 'Table', 'Grouped Column Chart')
   */
  export function changeRenderer(newRenderer: string): void {
    rendererName = newRenderer;
    openDropdown = false;
    emitChange();
  }

  /**
   * Set filter values programmatically for a dimension.
   * This is the SAME logic that the filter dialog uses.
   * @param dimensionName - Name of the dimension to filter (e.g., 'Region')
   * @param valuesToExclude - Array of values to exclude/hide from the pivot table
   */
  export function setFilter(dimensionName: string, valuesToExclude: string[]): void {
    const newFilter = { ...valueFilter };

    if (valuesToExclude.length === 0) {
      // No values to exclude = clear the filter for this dimension
      delete newFilter[dimensionName];
    } else {
      // Create filter object with excluded values
      newFilter[dimensionName] = {};
      for (const value of valuesToExclude) {
        newFilter[dimensionName][value] = true;
      }
    }

    valueFilter = newFilter;
    emitChange();
  }

  // ============================================================================
  // Styles Injection (Shadow DOM)
  // ============================================================================
  
  function injectStyles() {
    const root = container?.getRootNode();
    if (root instanceof ShadowRoot) {
      const style = document.createElement('style');
      style.textContent = PIVOT_CSS;
      root.appendChild(style);
    }
  }

  // ============================================================================
  // Export Functions
  // ============================================================================
  
  export function exportTSV(): string {
    return renderPivotTableTSV(pivotData);
  }

  export function getPivotData(): PivotData {
    return pivotData;
  }

  export function getState(): PivotTableState {
    return { rows, cols, vals, aggregatorName, rendererName, valueFilter, rowOrder, colOrder };
  }

  // Public method to fetch data with parameters (for use after initial load)
  export async function fetchData(params: Record<string, any> = {}) {
    if (!reportId || !apiBaseUrl) {
      console.warn('rb-pivot-table: fetchData requires reportId and apiBaseUrl');
      return;
    }
    
    loading = true;
    const headers: Record<string, string> = {};
    // TEMP: API key disabled for rollback
    // if (apiKey) headers['X-API-Key'] = apiKey;
    
    try {
      // Re-fetch config (uses module-level dedup cache)
      const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
      const config = await fetchConfigCached(configUrl, headers);

      // Update pivot table options from fresh config (named or default)
      const pivotOpts = (componentId && config.namedPivotTableOptions?.[componentId])
        ? config.namedPivotTableOptions[componentId]
        : config.pivotTableOptions;
      if (pivotOpts) {
        const opts = pivotOpts;
        if (opts.rows) rows = opts.rows;
        if (opts.cols) cols = opts.cols;
        if (opts.vals) vals = opts.vals;
        if (opts.aggregatorName) aggregatorName = opts.aggregatorName;
        if (opts.rendererName) rendererName = opts.rendererName;
        if (opts.valueFilter) valueFilter = opts.valueFilter;
        if (opts.rowOrder) rowOrder = opts.rowOrder;
        if (opts.colOrder) colOrder = opts.colOrder;
        if (opts.hiddenAttributes) hiddenAttributes = opts.hiddenAttributes;
        if (opts.hiddenFromAggregators) hiddenFromAggregators = opts.hiddenFromAggregators;
        if (opts.hiddenFromDragDrop) hiddenFromDragDrop = opts.hiddenFromDragDrop;
        if (opts.unusedOrientationCutoff != null) unusedOrientationCutoff = opts.unusedOrientationCutoff;
        if (opts.menuLimit != null) menuLimit = opts.menuLimit;
        if (opts.derivedAttributes) derivedAttributes = parseDerivedAttributeExpressions(opts.derivedAttributes);
        if (opts.sorters) sorters = opts.sorters;
      }

      // Update raw DSL for Configuration tab
      if (config.pivotTableDsl) {
        configDsl = config.pivotTableDsl;
      }

      // Build query string from params (merge reportParams + caller params + componentId)
      const mergedParams = new URLSearchParams({ ...reportParams, ...params } as Record<string, string>);
      if (testMode) mergedParams.set('testMode', 'true');
      if (componentId) mergedParams.set('componentId', componentId);
      const queryString = mergedParams.toString();
      const url = queryString
        ? `${apiBaseUrl}/reports/${reportId}/data?${queryString}`
        : `${apiBaseUrl}/reports/${reportId}/data`;

      // Longer timeout (60s) because backend may process multiple requests sequentially
      const res = await fetchWithTimeout(url, { headers }, 60000);
      if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
      const dataResult = await res.json();
      // Backend returns { data: [...] }, extract the array
      data = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

      // Check if backend returned an error payload (ClickHouse unavailable, SQL error, etc.)
      if (data && data.length === 1 && data[0].ERROR_MESSAGE) {
        error = data[0].ERROR_MESSAGE;
        dispatch('error', { message: error });
        loading = false;
        return;
      }

      materializeInput(data);
      dispatch('dataFetched', {
        data,
        executionTimeMillis: dataResult?.executionTimeMillis || 0,
        totalRows: dataResult?.totalRows || data.length,
        truncated: dataResult?.truncated || false,
        reportColumnNames: dataResult?.reportColumnNames || [],
      });
    } catch (err: any) {
      error = err.message || 'Failed to fetch data';
      dispatch('error', { message: error });
    }
    loading = false;
  }
</script>

<!-- ============================================================================ -->
<!-- Template -->
<!-- ============================================================================ -->
{#if loading}
  <div class="rb-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>
    {#if engine === 'duckdb' || engine === 'clickhouse'}
      Loading pivot data from server ({engine})...
    {:else}
      Loading...
    {/if}
  </div>
{/if}
{#if error}
  <div class="rb-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
{#if serverMetadata && (engine === 'duckdb' || engine === 'clickhouse')}
  <div class="rb-server-info">
    ⚡ Server-side processing ({engine}): {serverMetadata.rowCount} rows in {serverMetadata.executionTimeMs}ms
  </div>
{/if}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={container}
  class="pvtUi-container"
  id={componentId ? `widgetPivot-${componentId}` : undefined}
  style:display={loading || error ? 'none' : 'block'}
  on:click={() => openDropdown = false}
  on:keydown={(e) => { if (e.key === 'Escape') openDropdown = false; }}
  role="application"
  aria-label="Pivot Table"
  tabindex="-1"
>
  <table class="pvtUi">
    <tbody>
      {#if horizUnused}
        <!-- Horizontal layout for unused attrs -->
        <tr>
          <!-- Renderer dropdown -->
          <td class="pvtRenderers">
            <div class="pvtDropdown" style="z-index: {openDropdown === 'renderer' ? maxZIndex + 1 : 1}">
              <button 
                type="button"
                class="pvtDropdownValue pvtDropdownCurrent {openDropdown === 'renderer' ? 'pvtDropdownCurrentOpen' : ''}"
                on:click|stopPropagation={() => openDropdown = openDropdown === 'renderer' ? false : 'renderer'}
              >
                <span class="pvtDropdownIcon">{openDropdown === 'renderer' ? '×' : '▾'}</span>
                {rendererName}
              </button>
              {#if openDropdown === 'renderer'}
                <div class="pvtDropdownMenu">
                  {#each rendererNames as name}
                    <button 
                      type="button"
                      class="pvtDropdownValue {name === rendererName ? 'pvtDropdownActiveValue' : ''}"
                      on:click|stopPropagation={() => setRenderer(name)}
                    >
                      {name}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </td>
          
          <!-- Unused attributes -->
          <td 
            class="pvtAxisContainer pvtUnused pvtHorizList"
            on:dragover={onDragOver}
            on:drop={onDropUnused}
          >
            {#each unusedAttrs as attr}
              <li 
                draggable="true"
                on:dragstart={(e) => onDragStart(e, attr)}
              >
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
                
                {#if openFilterBox === attr}
                  <div 
                    class="pvtFilterBox" 
                    style="z-index: {zIndices[attr] || maxZIndex}"
                    on:click|stopPropagation={() => moveToTop(attr)}
                    on:keydown|stopPropagation={(e) => { if (e.key === 'Escape') openFilterBox = null; }}
                    role="dialog" tabindex="-1"
                    aria-label="Filter {attr}"
                  >
                    <button type="button" class="pvtCloseX" on:click|stopPropagation={() => openFilterBox = null}>×</button>
                    <h4>{attr}</h4>
                    
                    {#if Object.keys(attrValues[attr] || {}).length < menuLimit}
                      <p>
                        <input 
                          type="text" 
                          class="pvtSearch" 
                          placeholder="Filter values"
                          bind:value={filterText}
                        />
                        <br />
                        <button type="button" class="pvtButton" on:click={() => selectAllFiltered(attr)}>Select All</button>
                        <button type="button" class="pvtButton" on:click={() => deselectAllFiltered(attr)}>Deselect All</button>
                      </p>
                      
                      <div class="pvtCheckContainer">
                        {#each Object.keys(attrValues[attr] || {}).filter(matchesFilter).sort(getSort(sorters, attr)) as value}
                          <button 
                            type="button"
                            class="pvtCheckItem {isValueFiltered(attr, value) ? '' : 'selected'}"
                            on:click={() => toggleValue(attr, value)}
                          >
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><span class="pvtOnly" on:click|stopPropagation={() => selectOnly(attr, value)}>only</span>
                            <span class="pvtOnlySpacer">&nbsp;</span>
                            {value === '' ? '(blank)' : value}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <p>(too many values to show)</p>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </td>
        </tr>
        
        <tr>
          <!-- Aggregator -->
          <td class="pvtVals">
            <div class="pvtDropdown" style="z-index: {openDropdown === 'aggregator' ? maxZIndex + 1 : 1}">
              <button 
                type="button"
                class="pvtDropdownValue pvtDropdownCurrent {openDropdown === 'aggregator' ? 'pvtDropdownCurrentOpen' : ''}"
                on:click|stopPropagation={() => openDropdown = openDropdown === 'aggregator' ? false : 'aggregator'}
              >
                <span class="pvtDropdownIcon">{openDropdown === 'aggregator' ? '×' : '▾'}</span>
                {aggregatorName}
              </button>
              {#if openDropdown === 'aggregator'}
                <div class="pvtDropdownMenu">
                  {#each aggregatorOptions as name}
                    <button 
                      type="button"
                      class="pvtDropdownValue {name === aggregatorName ? 'pvtDropdownActiveValue' : ''}"
                      on:click|stopPropagation={() => setAggregator(name)}
                    >
                      {name}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            
            <!-- Sort buttons -->
            <button type="button" class="pvtRowOrder" on:click={toggleRowOrder}>{sortIcons[rowOrder].rowSymbol}</button>
            <button type="button" class="pvtColOrder" on:click={toggleColOrder}>{sortIcons[colOrder].colSymbol}</button>
            
            <!-- Value selectors -->
            {#if numValsAllowed > 0}
              <br />
              {#each Array(numValsAllowed) as _, i}
                <div class="pvtDropdown" style="z-index: {openDropdown === `val${i}` ? maxZIndex + 1 : 1}">
                  <button 
                    type="button"
                    class="pvtDropdownValue pvtDropdownCurrent {openDropdown === `val${i}` ? 'pvtDropdownCurrentOpen' : ''}"
                    on:click|stopPropagation={() => openDropdown = openDropdown === `val${i}` ? false : `val${i}`}
                  >
                    <span class="pvtDropdownIcon">{openDropdown === `val${i}` ? '×' : '▾'}</span>
                    {vals[i] || '(select)'}
                  </button>
                  {#if openDropdown === `val${i}`}
                    <div class="pvtDropdownMenu">
                      {#each valOptions as opt}
                        <button 
                          type="button"
                          class="pvtDropdownValue {opt === vals[i] ? 'pvtDropdownActiveValue' : ''}"
                          on:click|stopPropagation={() => setVal(i, opt)}
                        >
                          {opt}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
                {#if i < numValsAllowed - 1}<br />{/if}
              {/each}
            {/if}
          </td>
          
          <!-- Column attributes -->
          <td 
            class="pvtAxisContainer pvtHorizList pvtCols"
            on:dragover={onDragOver}
            on:drop={onDropCols}
          >
            {#each visibleCols as attr}
              <li draggable="true" on:dragstart={(e) => onDragStart(e, attr)}>
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
                
                {#if openFilterBox === attr}
                  <div 
                    class="pvtFilterBox" 
                    style="z-index: {zIndices[attr] || maxZIndex}"
                    on:click|stopPropagation={() => moveToTop(attr)}
                    on:keydown|stopPropagation={(e) => { if (e.key === 'Escape') openFilterBox = null; }}
                    role="dialog" tabindex="-1"
                    aria-label="Filter {attr}"
                  >
                    <button type="button" class="pvtCloseX" on:click|stopPropagation={() => openFilterBox = null}>×</button>
                    <h4>{attr}</h4>
                    
                    {#if Object.keys(attrValues[attr] || {}).length < menuLimit}
                      <p>
                        <input 
                          type="text" 
                          class="pvtSearch" 
                          placeholder="Filter values"
                          bind:value={filterText}
                        />
                        <br />
                        <button type="button" class="pvtButton" on:click={() => selectAllFiltered(attr)}>Select All</button>
                        <button type="button" class="pvtButton" on:click={() => deselectAllFiltered(attr)}>Deselect All</button>
                      </p>
                      
                      <div class="pvtCheckContainer">
                        {#each Object.keys(attrValues[attr] || {}).filter(matchesFilter).sort(getSort(sorters, attr)) as value}
                          <button 
                            type="button"
                            class="pvtCheckItem {isValueFiltered(attr, value) ? '' : 'selected'}"
                            on:click={() => toggleValue(attr, value)}
                          >
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><span class="pvtOnly" on:click|stopPropagation={() => selectOnly(attr, value)}>only</span>
                            <span class="pvtOnlySpacer">&nbsp;</span>
                            {value === '' ? '(blank)' : value}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <p>(too many values to show)</p>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </td>
        </tr>
        
        <tr>
          <!-- Row attributes -->
          <td 
            class="pvtAxisContainer pvtVertList pvtRows"
            on:dragover={onDragOver}
            on:drop={onDropRows}
          >
            {#each visibleRows as attr}
              <li draggable="true" on:dragstart={(e) => onDragStart(e, attr)}>
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
                
                {#if openFilterBox === attr}
                  <div 
                    class="pvtFilterBox" 
                    style="z-index: {zIndices[attr] || maxZIndex}"
                    on:click|stopPropagation={() => moveToTop(attr)}
                    on:keydown|stopPropagation={(e) => { if (e.key === 'Escape') openFilterBox = null; }}
                    role="dialog" tabindex="-1"
                    aria-label="Filter {attr}"
                  >
                    <button type="button" class="pvtCloseX" on:click|stopPropagation={() => openFilterBox = null}>×</button>
                    <h4>{attr}</h4>
                    
                    {#if Object.keys(attrValues[attr] || {}).length < menuLimit}
                      <p>
                        <input 
                          type="text" 
                          class="pvtSearch" 
                          placeholder="Filter values"
                          bind:value={filterText}
                        />
                        <br />
                        <button type="button" class="pvtButton" on:click={() => selectAllFiltered(attr)}>Select All</button>
                        <button type="button" class="pvtButton" on:click={() => deselectAllFiltered(attr)}>Deselect All</button>
                      </p>
                      
                      <div class="pvtCheckContainer">
                        {#each Object.keys(attrValues[attr] || {}).filter(matchesFilter).sort(getSort(sorters, attr)) as value}
                          <button 
                            type="button"
                            class="pvtCheckItem {isValueFiltered(attr, value) ? '' : 'selected'}"
                            on:click={() => toggleValue(attr, value)}
                          >
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><span class="pvtOnly" on:click|stopPropagation={() => selectOnly(attr, value)}>only</span>
                            <span class="pvtOnlySpacer">&nbsp;</span>
                            {value === '' ? '(blank)' : value}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <p>(too many values to show)</p>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </td>
          
          <!-- Output -->
          <td class="pvtOutput" bind:this={outputContainer}></td>
        </tr>
      {:else}
        <!-- Vertical layout for unused attrs -->
        <tr>
          <td class="pvtRenderers">
            <div class="pvtDropdown" style="z-index: {openDropdown === 'renderer' ? maxZIndex + 1 : 1}">
              <button 
                type="button"
                class="pvtDropdownValue pvtDropdownCurrent {openDropdown === 'renderer' ? 'pvtDropdownCurrentOpen' : ''}"
                on:click|stopPropagation={() => openDropdown = openDropdown === 'renderer' ? false : 'renderer'}
              >
                <span class="pvtDropdownIcon">{openDropdown === 'renderer' ? '×' : '▾'}</span>
                {rendererName}
              </button>
              {#if openDropdown === 'renderer'}
                <div class="pvtDropdownMenu">
                  {#each rendererNames as name}
                    <button 
                      type="button"
                      class="pvtDropdownValue {name === rendererName ? 'pvtDropdownActiveValue' : ''}"
                      on:click|stopPropagation={() => setRenderer(name)}
                    >
                      {name}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </td>
          
          <td class="pvtVals">
            <div class="pvtDropdown" style="z-index: {openDropdown === 'aggregator' ? maxZIndex + 1 : 1}">
              <button 
                type="button"
                class="pvtDropdownValue pvtDropdownCurrent {openDropdown === 'aggregator' ? 'pvtDropdownCurrentOpen' : ''}"
                on:click|stopPropagation={() => openDropdown = openDropdown === 'aggregator' ? false : 'aggregator'}
              >
                <span class="pvtDropdownIcon">{openDropdown === 'aggregator' ? '×' : '▾'}</span>
                {aggregatorName}
              </button>
              {#if openDropdown === 'aggregator'}
                <div class="pvtDropdownMenu">
                  {#each aggregatorOptions as name}
                    <button 
                      type="button"
                      class="pvtDropdownValue {name === aggregatorName ? 'pvtDropdownActiveValue' : ''}"
                      on:click|stopPropagation={() => setAggregator(name)}
                    >
                      {name}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <button type="button" class="pvtRowOrder" on:click={toggleRowOrder}>{sortIcons[rowOrder].rowSymbol}</button>
            <button type="button" class="pvtColOrder" on:click={toggleColOrder}>{sortIcons[colOrder].colSymbol}</button>
            {#if numValsAllowed > 0}
              <br />
              {#each Array(numValsAllowed) as _, i}
                <div class="pvtDropdown" style="z-index: {openDropdown === `val${i}` ? maxZIndex + 1 : 1}">
                  <button
                    type="button"
                    class="pvtDropdownValue pvtDropdownCurrent {openDropdown === `val${i}` ? 'pvtDropdownCurrentOpen' : ''}"
                    on:click|stopPropagation={() => openDropdown = openDropdown === `val${i}` ? false : `val${i}`}
                  >
                    <span class="pvtDropdownIcon">{openDropdown === `val${i}` ? '×' : '▾'}</span>
                    {vals[i] || '(select)'}
                  </button>
                  {#if openDropdown === `val${i}`}
                    <div class="pvtDropdownMenu">
                      {#each valOptions as opt}
                        <button
                          type="button"
                          class="pvtDropdownValue {opt === vals[i] ? 'pvtDropdownActiveValue' : ''}"
                          on:click|stopPropagation={() => setVal(i, opt)}
                        >
                          {opt}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
                {#if i < numValsAllowed - 1}<br />{/if}
              {/each}
            {/if}
          </td>

          <td
            class="pvtAxisContainer pvtHorizList pvtCols"
            on:dragover={onDragOver}
            on:drop={onDropCols}
          >
            {#each visibleCols as attr}
              <li draggable="true" on:dragstart={(e) => onDragStart(e, attr)}>
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
              </li>
            {/each}
          </td>
        </tr>
        
        <tr>
          <td 
            class="pvtAxisContainer pvtVertList pvtUnused"
            on:dragover={onDragOver}
            on:drop={onDropUnused}
          >
            {#each unusedAttrs as attr}
              <li draggable="true" on:dragstart={(e) => onDragStart(e, attr)}>
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
              </li>
            {/each}
          </td>
          
          <td 
            class="pvtAxisContainer pvtVertList pvtRows"
            on:dragover={onDragOver}
            on:drop={onDropRows}
          >
            {#each visibleRows as attr}
              <li draggable="true" on:dragstart={(e) => onDragStart(e, attr)}>
                <span class="pvtAttr {hasActiveFilter(attr) ? 'pvtFilteredAttribute' : ''}">
                  {attr}
                  <button type="button" class="pvtTriangle" on:click|stopPropagation={() => toggleFilterBox(attr)}>▾</button>
                </span>
              </li>
            {/each}
          </td>
          
          <td class="pvtOutput" bind:this={outputContainer}></td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<script context="module" lang="ts">
  // Module-level: shared across all <rb-pivot-table> instances on the page.
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

  // CSS embedded for shadow DOM.
  // Theme-inheriting & framework-agnostic: backgrounds inherit the page (transparent),
  // text uses currentColor, structure is derived from currentColor via color-mix, and
  // OPAQUE overlays fall back to the CSS system color `Canvas`. A host MAY override:
  //   rb-pivot-table { --rb-pivot-border/-header-bg/-surface/-accent }
  // No daisyUI / Tailwind hardcoded here.
  const PIVOT_CSS = `
.pvtUi-container {
  font-family: Verdana, sans-serif;
}
/* Reset button styles for all buttons in component */
.pvtUi-container button {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
.pvtUi {
  color: inherit;
  font-family: Verdana;
  border-collapse: collapse;
}
.pvtUi select {
  user-select: none;
}
.pvtUi td.pvtOutput {
  vertical-align: top;
}
table.pvtTable {
  font-size: 8pt;
  text-align: left;
  border-collapse: collapse;
  margin-top: 3px;
  margin-left: 3px;
  font-family: Verdana;
}
table.pvtTable thead tr th,
table.pvtTable tbody tr th {
  background-color: var(--rb-pivot-header-bg, color-mix(in srgb, currentColor 8%, transparent));
  color: inherit;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 18%, transparent));
  font-size: 8pt;
  padding: 5px;
}
table.pvtTable .pvtColLabel {
  text-align: center;
}
table.pvtTable .pvtTotalLabel {
  text-align: right;
}
table.pvtTable tbody tr td {
  color: inherit;
  padding: 5px;
  background-color: transparent;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 12%, transparent));
  vertical-align: top;
  text-align: right;
}
.pvtTotal, .pvtGrandTotal {
  font-weight: bold;
}
button.pvtRowOrder, button.pvtColOrder {
  cursor: pointer;
  width: 15px;
  margin-left: 5px;
  display: inline-block;
  user-select: none;
  background: none;
  border: none;
  font-size: inherit;
  color: inherit;
}
.pvtAxisContainer, .pvtVals {
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 18%, transparent));
  background: var(--rb-pivot-header-bg, color-mix(in srgb, currentColor 6%, transparent));
  padding: 5px;
  min-width: 20px;
  min-height: 20px;
}
.pvtRenderers {
  padding-left: 5px;
  user-select: none;
}
.pvtDropdown {
  display: inline-block;
  position: relative;
  user-select: none;
  margin: 3px;
}
.pvtDropdownIcon {
  float: right;
  color: color-mix(in srgb, currentColor 55%, transparent);
}
.pvtDropdownCurrent {
  text-align: left;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 22%, transparent));
  border-radius: 4px;
  display: inline-block;
  position: relative;
  width: 210px;
  box-sizing: border-box;
  background: var(--rb-pivot-surface, Canvas);
  color: inherit;
  padding: 2px 5px;
  cursor: pointer;
  font-size: 12px;
}
.pvtDropdownCurrentOpen {
  border-radius: 4px 4px 0 0;
}
.pvtDropdownMenu {
  background: var(--rb-pivot-surface, Canvas);
  color: inherit;
  position: absolute;
  width: 100%;
  min-width: 200px;
  margin-top: -1px;
  border-radius: 0 0 4px 4px;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 22%, transparent));
  border-top: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 12%, transparent));
  box-sizing: border-box;
  max-height: 300px;
  overflow-y: auto;
}
.pvtDropdownValue {
  padding: 2px 5px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  display: block;
  width: 100%;
  box-sizing: border-box;
}
.pvtDropdownValue:hover {
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.pvtDropdownActiveValue {
  background: var(--rb-pivot-accent, color-mix(in srgb, currentColor 16%, transparent));
}
.pvtVals {
  text-align: center;
  white-space: nowrap;
  vertical-align: top;
  padding-bottom: 12px;
}
.pvtRows {
  height: 35px;
}
.pvtAxisContainer li {
  padding: 8px 6px;
  list-style-type: none;
  cursor: move;
}
.pvtAxisContainer li.pvtPlaceholder {
  border-radius: 5px;
  padding: 3px 15px;
  border: 1px dashed var(--rb-pivot-border, color-mix(in srgb, currentColor 30%, transparent));
}
.pvtAxisContainer li span.pvtAttr {
  background: var(--rb-pivot-header-bg, color-mix(in srgb, currentColor 8%, transparent));
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 18%, transparent));
  color: inherit;
  padding: 2px 5px;
  white-space: nowrap;
  border-radius: 5px;
  user-select: none;
}
button.pvtTriangle {
  cursor: pointer;
  color: inherit;
  background: none;
  border: none;
  padding: 0 2px;
  font-size: inherit;
}
.pvtHorizList li {
  display: inline-block;
}
.pvtVertList {
  vertical-align: top;
}
.pvtFilteredAttribute {
  font-style: italic;
}
.pvtFilterBox {
  z-index: 100;
  width: 300px;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 30%, transparent));
  background-color: var(--rb-pivot-surface, Canvas);
  color: inherit;
  position: absolute;
  text-align: center;
  user-select: none;
  min-height: 100px;
  padding: 10px;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}
.pvtFilterBox h4 {
  margin: 15px 0 10px;
}
.pvtFilterBox p {
  margin: 10px auto;
}
.pvtFilterBox input[type='text'] {
  width: 230px;
  padding: 5px;
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 22%, transparent));
  background: transparent;
  color: inherit;
  border-radius: 4px;
  margin-bottom: 5px;
}
.pvtCheckContainer {
  text-align: left;
  font-size: 14px;
  white-space: nowrap;
  overflow-y: scroll;
  width: 100%;
  max-height: 30vh;
  border-top: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 14%, transparent));
}
.pvtCheckItem {
  display: block;
  width: 100%;
  margin: 0;
  margin-bottom: 1px;
  padding: 3px;
  cursor: pointer;
  text-align: left;
  background: none;
  border: none;
  font-size: 14px;
}
.pvtCheckItem.selected {
  background: var(--rb-pivot-accent, color-mix(in srgb, currentColor 16%, transparent));
}
.pvtCheckItem:hover .pvtOnly {
  display: block;
}
.pvtCheckItem:hover .pvtOnlySpacer {
  display: none;
}
.pvtOnly {
  display: none;
  width: 35px;
  float: left;
  font-size: 12px;
  padding-left: 5px;
  cursor: pointer;
  color: var(--rb-pivot-accent, currentColor);
}
.pvtOnlySpacer {
  display: block;
  width: 35px;
  float: left;
}
button.pvtCloseX {
  position: absolute;
  right: 8px;
  top: 5px;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
}
button.pvtButton {
  color: inherit;
  border-radius: 5px;
  padding: 3px 6px;
  background: var(--rb-pivot-header-bg, color-mix(in srgb, currentColor 8%, transparent));
  border: 1px solid var(--rb-pivot-border, color-mix(in srgb, currentColor 18%, transparent));
  font-size: 14px;
  margin: 3px;
  cursor: pointer;
}
button.pvtButton:hover {
  background: color-mix(in srgb, currentColor 14%, transparent);
  border-color: var(--rb-pivot-border, color-mix(in srgb, currentColor 28%, transparent));
}
.pvtError {
  color: #e15759;
  padding: 20px;
  text-align: center;
}
.pvtOutput canvas {
  max-width: 100%;
  min-height: 300px;
  max-height: 400px;
}
`;
</script>

<style>
  :host {
    display: block;
  }
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
  .rb-server-info {
    padding: 0.5rem 1rem;
    text-align: center;
    font-size: 0.875rem;
    color: #059669;
    background: #ecfdf5;
    border: 1px solid #10b981;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }
</style>

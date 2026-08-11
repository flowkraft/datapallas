<svelte:options customElement="rb-filter-pane" accessors={true} />

<script context="module" lang="ts">
  // Module-level: shared across all <rb-filter-pane> instances on the page.
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
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  // ============================================================================
  // Two usage modes:
  //
  // MODE 1 — "Data Push" (parent fetches data, passes via props)
  //   Props: [data], [field], plus DSL config props
  //   Parent (Angular) calls the API, gets reportData, then renders:
  //     <rb-filter-pane [data]="result.reportData" field="ShipCountry">
  //   Used in: Configuration > Test SQL/Script button — Angular fetches data once
  //   and pushes the SAME dataset to Tabulator, Chart, PivotTable, and FilterPane.
  //   This avoids N separate API calls for the same data.
  //
  // MODE 2 — "Self-Fetch" (component fetches its own config + data)
  //   Props: [reportId], [apiBaseUrl], [reportParams], [testMode], [componentId]
  //   Component calls GET /reports/{code}/config then GET /reports/{code}/data
  //   Used in: Processing > View Data, dashboards with named components.
  //
  // Both modes converge at loadDistinctValues() where distinct values are
  // extracted regardless of how data was obtained.
  // ============================================================================

  // ============================================================================
  // Core Props (HTML attributes on the web component)
  // ============================================================================
  export let reportId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  export let componentId: string = '';
  export let connectionId: string = '';
  export let tableName: string = '';
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  // ============================================================================
  // Mode 1 Prop — data push from parent (e.g., Angular test preview)
  // ============================================================================
  export let data: Record<string, any>[] = [];

  // ============================================================================
  // DSL Config Props — one required (field), rest have smart defaults
  //
  // Groovy DSL example:
  //   filterPane('countryFilter') {
  //     field 'ShipCountry'       // required
  //     label 'Country'           // default: field name
  //     sort 'asc'                // 'asc'|'desc'|'count_desc'|'none', default: 'asc'
  //     maxValues 500             // default: 500
  //     showSearch true           // default: auto (true when >10 values)
  //     showCount false           // default: false
  //     defaultSelected 'Germany' // default: [] (nothing)
  //     multiSelect true          // default: true
  //     height 'auto'             // default: 'auto' (grows, max 300px)
  //   }
  // ============================================================================
  export let field: string = '';                          // required
  export let label: string = '';                          // default: field name
  export let sort: 'asc' | 'desc' | 'count_desc' | 'none' = 'asc';
  export let maxValues: number = 500;
  export let showSearch: boolean | 'auto' = 'auto';      // 'auto' = true when >10 values
  export let showCount: boolean = false;
  export let defaultSelected: string[] = [];
  export let multiSelect: boolean = true;
  export let height: string = 'auto';                    // 'auto' = grows to fit, max 300px

  // Raw DSL source code (exposed for Configuration tab)
  export let configDsl: string = '';

  // ============================================================================
  // External state — set by parent to update visual states (associative exploration)
  // ============================================================================
  export let selectedValues: string[] = [];
  export let associatedValues: string[] | null = null;
  export let excludedValues: string[] | null = null;

  // ============================================================================
  // Internal state
  // ============================================================================
  let allValues: { value: string; count?: number }[] = [];
  let loading = true;
  let error: string | null = null;
  let searchQuery = '';

  const dispatch = createEventDispatcher();

  // Computed: effective label
  $: effectiveLabel = label || field || 'Filter Pane';

  // Computed: should show search
  $: effectiveShowSearch = showSearch === 'auto'
    ? allValues.length > 10
    : showSearch;

  // Computed: effective height style
  $: heightStyle = height === 'auto' ? 'max-height: 300px' : `height: ${height}`;

  // Build headers for API requests
  function buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    // The embed token is the only credential an embedded page can safely carry: it is short-lived
    // and unlocks one report. It works for report mode only — direct mode (connection-id +
    // table-name) goes through run-sql, which stays an authoring capability.
    if (embedToken) h['X-Embed-Token'] = embedToken;
    return h;
  }

  // Read attributes from host element (web component mode)
  onMount(async () => {
    const hostEl = findHostElement();
    if (hostEl) {
      if (!field) field = hostEl.getAttribute('field') || '';
      if (!label) label = hostEl.getAttribute('label') || '';
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
      if (!connectionId) connectionId = hostEl.getAttribute('connection-id') || '';
      if (!tableName) tableName = hostEl.getAttribute('table-name') || '';

      // DSL config attributes
      const sortAttr = hostEl.getAttribute('sort');
      if (sortAttr) sort = sortAttr as typeof sort;
      const maxAttr = hostEl.getAttribute('max-values');
      if (maxAttr) maxValues = parseInt(maxAttr) || 500;
      const searchAttr = hostEl.getAttribute('show-search');
      if (searchAttr === 'true') showSearch = true;
      else if (searchAttr === 'false') showSearch = false;
      const countAttr = hostEl.getAttribute('show-count');
      if (countAttr === 'true') showCount = true;
      const multiAttr = hostEl.getAttribute('multi-select');
      if (multiAttr === 'false') multiSelect = false;
      const heightAttr = hostEl.getAttribute('height');
      if (heightAttr) height = heightAttr;
      const defaultSelAttr = hostEl.getAttribute('default-selected');
      if (defaultSelAttr) defaultSelected = defaultSelAttr.split(',').map(s => s.trim());
      const testModeAttr = hostEl.getAttribute('test-mode');
      if (testModeAttr === 'true') testMode = true;
    }

    // ====================================================================
    // MODE 1: Data Push — if data prop is provided, skip all fetching
    // ====================================================================
    if (data && data.length > 0) {
      extractDistinctValuesFromData(data);
      if (defaultSelected.length > 0 && selectedValues.length === 0) {
        selectedValues = [...defaultSelected];
      }
      loading = false;
      dispatch('dataFetched', { totalRows: allValues.length, field, componentId });
      return;
    }

    // ====================================================================
    // MODE 2: Self-Fetch — if reportId + apiBaseUrl provided, fetch config
    // from Java backend (same pattern as RbTabulator, RbChart, RbPivotTable)
    // ====================================================================
    if (reportId && apiBaseUrl) {
      try {
        const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
        const headers = buildHeaders();
        const config = await fetchConfigCached(configUrl, headers);

        // Extract named config for this componentId, or fall back to unnamed
        let fpConfig: any = null;
        if (componentId && config.namedFilterPaneOptions?.[componentId]) {
          fpConfig = config.namedFilterPaneOptions[componentId];
        } else if (config.filterPaneOptions) {
          fpConfig = config.filterPaneOptions;
        }

        // Apply config values (only override if not already set via attributes)
        if (fpConfig) {
          if (fpConfig.field && !field) field = fpConfig.field;
          if (fpConfig.label) label = fpConfig.label;
          if (fpConfig.sort) sort = fpConfig.sort;
          if (fpConfig.maxValues != null) maxValues = fpConfig.maxValues;
          if (fpConfig.showSearch != null) showSearch = fpConfig.showSearch;
          if (fpConfig.showCount != null) showCount = fpConfig.showCount;
          if (fpConfig.multiSelect != null) multiSelect = fpConfig.multiSelect;
          if (fpConfig.height) height = fpConfig.height;
          if (fpConfig.defaultSelected?.length > 0) defaultSelected = fpConfig.defaultSelected;
        }

        // Store raw DSL for display
        if (config.filterPaneDsl) configDsl = config.filterPaneDsl;
      } catch (e: any) {
        console.warn('rb-filter-pane: Failed to fetch config', e);
      }
    }

    // Apply default selections
    if (defaultSelected.length > 0 && selectedValues.length === 0) {
      selectedValues = [...defaultSelected];
    }

    await loadDistinctValues();
  });

  onDestroy(() => {
    // No external library to clean up currently.
    // Stub for consistency with other rb-* components and future resource cleanup.
  });

  function findHostElement(): Element | null {
    const el = document.querySelector(`rb-filter-pane[component-id="${componentId}"]`);
    if (el) return el;
    return document.querySelector(`rb-filter-pane[field="${field}"]`);
  }

  /** Extract distinct values from a data array (Mode 1 or Mode 2 report-mode) */
  function extractDistinctValuesFromData(rows: Record<string, any>[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row[field] != null) {
        const val = String(row[field]);
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    }
    allValues = [...counts.entries()].map(([value, count]) => ({ value, count }));
    applySortAndLimit();
  }

  /** Apply sort order and maxValues limit to allValues */
  function applySortAndLimit() {
    if (sort === 'asc') allValues.sort((a, b) => a.value.localeCompare(b.value));
    else if (sort === 'desc') allValues.sort((a, b) => b.value.localeCompare(a.value));
    else if (sort === 'count_desc') allValues.sort((a, b) => (b.count || 0) - (a.count || 0));

    if (allValues.length > maxValues) allValues = allValues.slice(0, maxValues);
  }

  async function loadDistinctValues() {
    if (!field) { loading = false; return; }

    loading = true;
    error = null;

    try {
      const headers = buildHeaders();

      if (connectionId && tableName) {
        // Direct mode: query distinct values via connection
        const orderClause = sort === 'none' ? '' : ` ORDER BY "${field}" ${sort === 'desc' ? 'DESC' : 'ASC'}`;
        const sql = `SELECT DISTINCT "${field}" FROM "${tableName}" WHERE "${field}" IS NOT NULL${orderClause} LIMIT ${maxValues}`;

        const res = await fetch(`${apiBaseUrl}/queries/run-sql`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ connectionId: connectionId, sql }),
        });
        if (!res.ok) throw new Error(`Failed to load values: ${res.status}`);
        const result = await res.json();
        allValues = (result.data || []).map((row: any) => ({ value: String(row[field] ?? '') }));
        applySortAndLimit();

      } else if (reportId && apiBaseUrl) {
        // Report mode: fetch data and extract distinct values
        let dataUrl = `${apiBaseUrl}/reports/${reportId}/data?componentId=${componentId}`;
        if (testMode) dataUrl += '&testMode=true';

        // Append report params
        for (const [key, val] of Object.entries(reportParams || {})) {
          dataUrl += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
        }

        const res = await fetch(dataUrl, { headers });
        if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
        const dataResult = await res.json();
        const rows = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

        extractDistinctValuesFromData(rows);

        dispatch('dataFetched', {
          totalRows: allValues.length,
          executionTimeMillis: dataResult?.executionTimeMillis || 0,
          field,
          componentId,
        });
      }
    } catch (e: any) {
      error = e.message || 'Failed to load values';
      dispatch('fetchError', { message: error, field, componentId });
    } finally {
      loading = false;
    }
  }

  function getState(value: string): 'selected' | 'associated' | 'excluded' {
    if (selectedValues.includes(value)) return 'selected';
    if (excludedValues && excludedValues.includes(value)) return 'excluded';
    return 'associated';
  }

  function handleClick(value: string) {
    const isSelected = selectedValues.includes(value);
    dispatch('filterPaneSelect', {
      field,
      value,
      action: isSelected ? 'deselect' : 'select',
      multiSelect,
    });
  }

  export function refresh() {
    loadDistinctValues();
  }

  $: filteredValues = searchQuery
    ? allValues.filter(v => v.value.toLowerCase().includes(searchQuery.toLowerCase()))
    : allValues;

  // Re-sort: selected first, then associated, then excluded
  $: sortedValues = [...filteredValues].sort((a, b) => {
    const stateOrder = { selected: 0, associated: 1, excluded: 2 };
    const sa = getState(a.value);
    const sb = getState(b.value);
    if (stateOrder[sa] !== stateOrder[sb]) return stateOrder[sa] - stateOrder[sb];
    return 0; // preserve existing sort within same state
  });

  // Reactive: if data prop changes after mount (Mode 1), re-extract values
  $: if (data && data.length > 0 && field) {
    extractDistinctValuesFromData(data);
  }
</script>

<style>
  :host {
    display: block;
    width: 100%;
  }
  /* Theme-inheriting & framework-agnostic: container/surfaces inherit the page,
     text uses currentColor, structure is derived from currentColor via color-mix.
     A host MAY override: rb-filter-pane { --rb-border / --rb-surface / --rb-accent }.
     No daisyUI / Tailwind hardcoded. */
  .rb-filter-pane {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));
    border-radius: 8px;
    overflow: hidden;
    background: transparent;
    color: inherit;
  }
  .pane-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));
    background: color-mix(in srgb, currentColor 6%, transparent);
  }
  .pane-label {
    font-weight: 600;
    font-size: 12px;
    color: inherit;
    flex: 1;
  }
  .pane-search {
    font-size: 11px;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
    border-radius: 4px;
    padding: 3px 6px;
    outline: none;
    width: 100px;
    background: transparent;
    color: inherit;
  }
  .pane-search:focus {
    border-color: var(--rb-accent, var(--color-primary, #2171b5));
  }
  .pane-list {
    overflow-y: auto;
  }
  .pane-item {
    display: flex;
    align-items: center;
    padding: 5px 10px;
    cursor: pointer;
    transition: background 0.1s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-size: 12px;
    color: inherit;
  }
  .pane-item:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .pane-item.selected {
    background: var(--rb-accent, color-mix(in srgb, currentColor 16%, transparent));
    color: var(--rb-accent-text, inherit);
    font-weight: 600;
  }
  .pane-item.excluded {
    color: color-mix(in srgb, currentColor 60%, transparent);
    opacity: 0.5;
  }
  .pane-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .pane-dot.selected { background: var(--rb-accent, var(--color-primary, #2171b5)); }
  .pane-dot.associated { background: color-mix(in srgb, currentColor 25%, transparent); }
  .pane-dot.excluded { background: color-mix(in srgb, currentColor 40%, transparent); }
  .pane-value { flex: 1; }
  .pane-item-count {
    font-size: 10px;
    color: color-mix(in srgb, currentColor 60%, transparent);
    margin-left: 4px;
  }
  .pane-loading, .pane-error {
    padding: 12px;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }
  .pane-error { color: #dc2626; }
  .pane-footer {
    font-size: 11px;
    color: color-mix(in srgb, currentColor 60%, transparent);
    padding: 4px 10px;
    border-top: 1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));
    text-align: right;
  }
</style>

<div class="rb-filter-pane">
  <div class="pane-header">
    <span class="pane-label">{effectiveLabel}</span>
    {#if effectiveShowSearch}
      <input
        class="pane-search"
        type="text"
        placeholder="Search..."
        bind:value={searchQuery}
      />
    {/if}
  </div>

  {#if loading}
    <div class="pane-loading">Loading...</div>
  {:else if error}
    <div class="pane-error">{error}</div>
  {:else}
    <div class="pane-list" style={heightStyle}>
      {#each sortedValues as item}
        {@const state = getState(item.value)}
        <button
          class="pane-item {state}"
          on:click={() => handleClick(item.value)}
        >
          <span class="pane-dot {state}"></span>
          <span class="pane-value">{item.value}</span>
          {#if showCount && item.count != null}
            <span class="pane-item-count">({item.count})</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="pane-footer">{allValues.length} values</div>
  {/if}
</div>

<svelte:options customElement={{ tag: "rb-value", shadow: "none" }} />

<script context="module" lang="ts">
  // Module-level: shared across ALL <rb-value> instances on the page.
  // Deduplicates data requests when N components share the same reportId + componentId + params.
  const _dataCache = new Map<string, Promise<any>>();

  function fetchDataCached(url: string, headers: Record<string, string>): Promise<any> {
    let p = _dataCache.get(url);
    if (p) return p;
    p = fetch(url, { headers })
      .then(r => { if (!r.ok) throw new Error(`Data fetch failed: ${r.status}`); return r.json(); })
      .catch(e => { _dataCache.delete(url); throw e; });
    _dataCache.set(url, p);
    return p;
  }

  // Invalidate all cached data (called on param change / reload)
  function invalidateDataCache() {
    _dataCache.clear();
  }
</script>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  // ============================================================================
  // Two usage modes:
  //
  // MODE 1 — "Data Push" (parent fetches data, passes via props)
  //   Props: [data], [field], [format]
  //   Parent (e.g. AI Hub Data Canvas) calls the API, gets reportData, then renders:
  //     <rb-value [data]="result.reportData" field="total" format="currency">
  //   Used when the parent already has the data (live ad-hoc queries, dashboard
  //   value cards backed by a Data Canvas widget) and there is no reportId yet.
  //
  // MODE 2 — "Self-Fetch" (component fetches its own data)
  //   Props: [reportId], [apiBaseUrl], [apiKey], [componentId], [field], [format], [reportParams]
  //   Component calls GET /reports/{code}/data and reads rows[0][field].
  //   Used in: dashboards / saved report viewers where the value is bound to a
  //   stored report id.
  //
  // Both modes converge at displayValue = formatValue(rawValue, format).
  // ============================================================================

  // ============================================================================
  // Mode 2 Props — when reportId is provided, component self-fetches
  // ============================================================================
  export let reportId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  export let componentId: string = '';
  export let field: string = '';
  export let format: string = '';         // 'currency', 'number', 'percent', 'date', or ''
  export let reportParams: Record<string, string> = {};

  // ============================================================================
  // Mode 1 Prop — data push from parent (e.g., AI Hub Data Canvas)
  // ============================================================================
  export let data: Record<string, any>[] = [];

  // Internal state
  let container: HTMLSpanElement;
  let displayValue: string = '';
  let loading = true;
  let error: string | null = null;

  function formatValue(raw: any, fmt: string): string {
    if (raw === null || raw === undefined) return '';
    const str = String(raw);

    switch (fmt) {
      case 'currency': {
        const num = parseFloat(str.replace(/[^0-9.\-]/g, ''));
        if (isNaN(num)) return str;
        // Use Intl currency style so negative values render as "-$5,234,567"
        // (sign outside the symbol — trader convention) instead of "$-5,234,567".
        return num.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
      }
      case 'number': {
        const num = parseFloat(str.replace(/[^0-9.\-]/g, ''));
        if (isNaN(num)) return str;
        return num.toLocaleString('en-US');
      }
      case 'percent': {
        const num = parseFloat(str.replace(/[^0-9.\-]/g, ''));
        if (isNaN(num)) return str;
        // Use 1-2 decimals (not Math.round) so small values like 0.0811 show
        // as -8.11% instead of -8%. Drawdowns / returns / rates routinely live
        // in the sub-1% range where rounding to integer destroys signal.
        return (num * 100).toLocaleString('en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 2,
        }) + '%';
      }
      case 'date': {
        const d = new Date(str);
        if (isNaN(d.getTime())) return str;
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
      default:
        return str;
    }
  }

  async function fetchAndDisplay() {
    if (!reportId || !apiBaseUrl) return;

    loading = true;
    error = null;

    try {
      const headers: Record<string, string> = {};
      if (embedToken) headers['X-Embed-Token'] = embedToken;

      const dataQueryParams = new URLSearchParams(reportParams as Record<string, string>);
      if (componentId) dataQueryParams.set('componentId', componentId);
      const qs = dataQueryParams.toString();
      const dataUrl = qs
        ? `${apiBaseUrl}/reports/${reportId}/data?${qs}`
        : `${apiBaseUrl}/reports/${reportId}/data`;

      const dataResult = await fetchDataCached(dataUrl, headers);
      const rows = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

      const resolvedField = field || (rows.length > 0 ? Object.keys(rows[0])[0] : '');
      if (resolvedField && rows.length > 0 && resolvedField in rows[0]) {
        displayValue = formatValue(rows[0][resolvedField], format);
      } else {
        displayValue = '';
      }
    } catch (err: any) {
      error = err.message || 'Failed to load value';
      console.error('[rb-value] fetch error:', err);
    } finally {
      loading = false;
    }
  }

  /** Extract the value from a data array (Mode 1 — Data Push) */
  function extractValueFromData(rows: Record<string, any>[]) {
    const resolvedField = field || (rows.length > 0 ? Object.keys(rows[0])[0] : '');
    if (!resolvedField) { displayValue = ''; return; }
    if (rows.length > 0 && resolvedField in rows[0]) {
      displayValue = formatValue(rows[0][resolvedField], format);
    } else {
      displayValue = '';
    }
  }

  onMount(async () => {
    await tick();

    // Read attributes from host element (light DOM)
    const hostEl = container?.closest('rb-value');
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
      if (!field) field = hostEl.getAttribute('field') || '';
      if (!format) format = hostEl.getAttribute('format') || '';
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
    }

    // ====================================================================
    // MODE 1: Data Push — if data prop is provided, skip all fetching
    // ====================================================================
    if (data && data.length > 0) {
      extractValueFromData(data);
      loading = false;
      return;
    }

    // ====================================================================
    // MODE 2: Self-Fetch — if reportId + apiBaseUrl + field provided
    // ====================================================================
    await fetchAndDisplay();

    // Listen for parameter submit events (from rb-parameters via rb-report).
    // Walk up to find the dashboard/report root and listen for submit.
    _reportRoot = container?.closest('rb-report') || container?.closest('rb-dashboard') || null;
    if (_reportRoot) {
      _reportRoot.addEventListener('submit', _onReportSubmit as EventListener);
    }

    // Also listen for rb-value-reload custom event (for standalone usage).
    document.addEventListener('rb-value-reload', _onValueReload as EventListener);
  });

  let _reportRoot: Element | null = null;
  const _onReportSubmit = (e: CustomEvent) => {
    if (e.detail) reportParams = { ...reportParams, ...e.detail };
    invalidateDataCache();
    fetchAndDisplay();
  };
  const _onValueReload = (e: CustomEvent) => {
    if (!e.detail?.reportId || e.detail.reportId === reportId) {
      if (e.detail?.params) reportParams = { ...reportParams, ...e.detail.params };
      invalidateDataCache();
      fetchAndDisplay();
    }
  };

  onDestroy(() => {
    if (_reportRoot) _reportRoot.removeEventListener('submit', _onReportSubmit as EventListener);
    document.removeEventListener('rb-value-reload', _onValueReload as EventListener);
  });

  // Reactive: if data prop changes after mount (Mode 1), re-extract the value
  $: if (data && data.length > 0 && field) {
    extractValueFromData(data);
    loading = false;
  }
</script>

<span bind:this={container} class="rb-value-root" id={componentId ? `widgetValue-${componentId}` : undefined}>
  {#if loading}
    <span class="rb-value-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>...</span>
  {:else if error}
    <span class="rb-value-error" id={componentId ? `widgetError-${componentId}` : undefined} title={error}>--</span>
  {:else}
    {displayValue}
  {/if}
</span>

<style>
  .rb-value-root {
    display: inline;
  }
  .rb-value-loading {
    opacity: 0.4;
  }
  .rb-value-error {
    color: #dc2626;
    cursor: help;
  }
</style>

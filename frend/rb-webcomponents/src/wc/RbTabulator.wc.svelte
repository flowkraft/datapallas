<svelte:options customElement={{ tag: "rb-tabulator", shadow: "none" }} />

<script context="module" lang="ts">
  // Module-level: shared across all <rb-tabulator> instances on the page.
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
  import {
    onMount,
    afterUpdate,
    onDestroy,
    tick,
    createEventDispatcher,
  } from 'svelte';
  import {
    TabulatorFull as Tabulator,
    type Options,
    type ColumnDefinition,
  } from 'tabulator-tables';

  // Inline CSS at build time via Vite ?raw imports.
  // Injected once into document <head> — no shadow DOM, no async CDN loads.
  // @ts-ignore — Vite ?raw import
  import lightCSS from 'tabulator-tables/dist/css/tabulator.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import midnightCSS from 'tabulator-tables/dist/css/tabulator_midnight.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import simpleCSS from 'tabulator-tables/dist/css/tabulator_simple.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import modernCSS from 'tabulator-tables/dist/css/tabulator_modern.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import siteDarkCSS from 'tabulator-tables/dist/css/tabulator_site_dark.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import bootstrap3CSS from 'tabulator-tables/dist/css/tabulator_bootstrap3.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import bootstrap4CSS from 'tabulator-tables/dist/css/tabulator_bootstrap4.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import bootstrap5CSS from 'tabulator-tables/dist/css/tabulator_bootstrap5.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import semanticuiCSS from 'tabulator-tables/dist/css/tabulator_semanticui.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import bulmaCSS from 'tabulator-tables/dist/css/tabulator_bulma.min.css?raw';
  // @ts-ignore — Vite ?raw import
  import materializeCSS from 'tabulator-tables/dist/css/tabulator_materialize.min.css?raw';

  // ============================================================================
  // Two usage modes:
  //
  // MODE 1 — "Data Push" (parent fetches data, passes via props)
  //   Props: [data], [columns], [options], [loading]
  //   Parent (Angular) calls the API, gets reportData, then renders:
  //     <rb-tabulator [data]="result.reportData" [columns]="..." [options]="...">
  //   Used in: Configuration > Test SQL/Script button — Angular fetches data once
  //   and pushes the SAME dataset to Tabulator, Chart, and Pivot Table previews.
  //   This avoids 3 separate API calls for the same data.
  //
  // MODE 2 — "Self-Fetch" (component fetches its own config + data)
  //   Props: [reportId], [apiBaseUrl], [reportParams], [testMode], [componentId]
  //   Component calls GET /reports/{code}/config then GET /reports/{code}/data
  //   Used in:
  //     - Configuration > Tabulator/Chart/Pivot Preview for named components
  //       (aggregator reports)
  //     - Processing > View Data button
  //   Needed because: View Data must support server-side pagination for large
  //   datasets (the component manages its own pagination state via
  //   ajaxRequestFunc). Named components need componentId-specific config that
  //   only the component knows.
  //
  // Both modes converge at the opts = Object.assign({}, options || {}) line
  // where Tabulator is initialized with the same options regardless of how
  // data/config was obtained.
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
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  // ============================================================================
  // Theme — controls which CSS is injected into document head
  //   '' or 'light'     -> tabulator.min.css
  //   'midnight'         -> tabulator_midnight.min.css
  //   'midnight-site'    -> midnight + tabulator.info colour overrides
  // ============================================================================
  export let theme: string = '';

  // ============================================================================
  // Mode 1 Props — traditional props-based usage (e.g., from Angular)
  // ============================================================================
  export let data: any[] = [];
  export let columns: ColumnDefinition[] = [];
  export let options: any = {};

  // ============================================================================
  // Internal state for self-fetch mode
  // ============================================================================
  let loading = false;
  let error: string | null = null;

  // Raw DSL source code (exposed for Configuration tab)
  export let configDsl: string = '';

  // Exact colour overrides matching tabulator.info/examples/6.3.
  const MIDNIGHT_SITE_CSS = `
    .tabulator { background-color:#1a1a1a; border:1px solid #333; font-size:14px; }
    .tabulator .tabulator-header { background-color:#1a1a1a; border-bottom:3px solid #00bc8c; color:#fff; }
    .tabulator .tabulator-header .tabulator-col { background-color:#1a1a1a; border-right:1px solid #333; font-weight:700; color:#fff; }
    .tabulator .tabulator-header .tabulator-col.tabulator-sortable:hover { background-color:#222 !important; color:#fff !important; }
    .tabulator .tabulator-tableholder { background-color:#1a1a1a; }
    .tabulator .tabulator-tableholder .tabulator-table { background-color:#1a1a1a; color:#ddd; }
    .tabulator .tabulator-row { background-color:#1a1a1a; color:#ddd; border-bottom:1px solid #333; min-height:38px; }
    .tabulator .tabulator-row.tabulator-row-even { background-color:#222; }
    .tabulator .tabulator-row:hover, .tabulator .tabulator-row.tabulator-row-even:hover { background-color:#2a2a2a !important; color:#ddd !important; cursor:pointer; }
    .tabulator .tabulator-row:hover .tabulator-cell { color:#ddd !important; }
    .tabulator .tabulator-row .tabulator-cell { border-right:1px solid #333; color:#ddd; }
    .tabulator .tabulator-footer { background-color:#1a1a1a; border-top:1px solid #333; color:#ddd; }
    .tabulator .tabulator-footer .tabulator-page { background-color:#222; color:#ddd; border:1px solid #444; }
    .tabulator .tabulator-footer .tabulator-page:hover { background-color:#333; color:#fff; }
    .tabulator .tabulator-footer .tabulator-page-size { background-color:#222; color:#ddd; border:1px solid #444; }
    .tabulator .tabulator-footer .tabulator-page.active { background-color:#00bc8c; color:#fff; border-color:#00bc8c; }
    .tabulator .tabulator-col-resize-handle { border-right:2px solid #444; }
    .tabulator .tabulator-header-filter input, .tabulator .tabulator-header-filter select { background-color:#222; color:#ddd; border:1px solid #444; }
    .tabulator-row.tabulator-row-moving { background-color:#333 !important; color:#ddd !important; border:1px solid #555 !important; }
    .tabulator-row.tabulator-row-moving .tabulator-cell { color:#ddd !important; }
    .tabulator-row.tabulator-moving { background-color:#1a1a1a !important; color:#ddd !important; border:1px solid #00bc8c !important; }
    .tabulator-row.tabulator-moving .tabulator-cell { color:#ddd !important; }
    .tabulator .tabulator-row.tabulator-selected { background-color:#00bc8c !important; color:#fff !important; }
    .tabulator .tabulator-row.tabulator-selected:hover { background-color:#00d6a0 !important; color:#fff !important; }
    .tabulator .tabulator-row.tabulator-selectable:hover { background-color:#2a2a2a !important; color:#ddd !important; }
    .tabulator .tabulator-editing input, .tabulator .tabulator-editing select { background-color:#222; color:#fff; border:1px solid #00bc8c; }
    .tabulator .tabulator-group { background-color:#111; border-bottom:1px solid #333; color:#aaa; }
  `;

  // CSS fix: explicit text contrast — prevents host-page color leakage via no-shadow-DOM.
  // Uses !important because host-page dark/light mode CSS can override normal specificity.
  const CONTRAST_FIX_CSS = `
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-header .tabulator-col,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-header .tabulator-col .tabulator-col-content .tabulator-col-title,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row .tabulator-cell,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-footer { color: #333 !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-header .tabulator-col:hover,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-header .tabulator-col.tabulator-sortable:hover { color: #111 !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row:hover,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row.tabulator-row-even:hover { background-color: #e6e6e6 !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row:hover .tabulator-cell { color: #111 !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row.tabulator-selected,
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-row.tabulator-selected .tabulator-cell { background-color: #1976D2 !important; color: #fff !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-footer .tabulator-page-size { background-color: #fff !important; color: #333 !important; border: 1px solid #aaa !important; }
.rb-tabulator-root[data-rb-theme-mode="light"] .tabulator .tabulator-footer .tabulator-page:hover { color: #111 !important; }

.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-header .tabulator-col,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-header .tabulator-col .tabulator-col-content .tabulator-col-title,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row .tabulator-cell,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-footer { color: #ddd !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-header .tabulator-col:hover,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-header .tabulator-col.tabulator-sortable:hover { color: #fff !important; background-color: #444 !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row:hover,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row.tabulator-row-even:hover { background-color: #2a2a2a !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row:hover .tabulator-cell { color: #fff !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row.tabulator-selected,
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-row.tabulator-selected .tabulator-cell { color: #fff !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-footer .tabulator-page-size { background-color: #222 !important; color: #ddd !important; border: 1px solid #444 !important; }
.rb-tabulator-root[data-rb-theme-mode="dark"] .tabulator .tabulator-footer .tabulator-page:hover { color: #fff !important; }

/* Moving row clone — Tabulator appends it to <body>, outside .rb-tabulator-root.
   Default theme gives it a white/light background, so force dark text for contrast. */
.tabulator-row.tabulator-moving,
.tabulator-row.tabulator-moving .tabulator-cell { color: #333 !important; }
`;

  // ──────────────────────────────────────────────────────────────────────────
  // "inherit" theme — framework-agnostic. Sits on top of Tabulator's structural
  // (light) CSS and overrides only COLORS so the table inherits the page:
  //   • background → transparent (theme shows through)
  //   • text       → inherit (currentColor = page text color)
  //   • borders/header/hover → derived from currentColor via color-mix
  // No daisyUI / Tailwind hardcoded. A host MAY override from outside:
  //   rb-tabulator { --rb-table-border/-header-bg/-row-alt-bg/-row-hover-bg/-accent/-accent-text }
  // ──────────────────────────────────────────────────────────────────────────
  const INHERIT_OVERRIDE_CSS = `
.rb-theme-inherit .tabulator { background: transparent !important; color: inherit !important; border: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 18%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-header { background: var(--rb-table-header-bg, color-mix(in srgb, currentColor 7%, transparent)) !important; color: inherit !important; border-bottom: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 18%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-header .tabulator-col { background: transparent !important; color: inherit !important; border-right: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 10%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-header .tabulator-col.tabulator-sortable:hover { background: color-mix(in srgb, currentColor 10%, transparent) !important; }
.rb-theme-inherit .tabulator .tabulator-tableholder { background: transparent !important; }
.rb-theme-inherit .tabulator .tabulator-tableholder .tabulator-table { background: transparent !important; color: inherit !important; }
.rb-theme-inherit .tabulator .tabulator-row { background: transparent !important; color: inherit !important; border-bottom: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 9%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-row.tabulator-row-even { background: var(--rb-table-row-alt-bg, color-mix(in srgb, currentColor 4%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-row:hover, .rb-theme-inherit .tabulator .tabulator-row.tabulator-row-even:hover { background: var(--rb-table-row-hover-bg, color-mix(in srgb, currentColor 10%, transparent)) !important; color: inherit !important; }
.rb-theme-inherit .tabulator .tabulator-row .tabulator-cell { border-right: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 7%, transparent)) !important; color: inherit !important; }
.rb-theme-inherit .tabulator .tabulator-row.tabulator-selected, .rb-theme-inherit .tabulator .tabulator-row.tabulator-selected .tabulator-cell { background: var(--rb-table-accent, color-mix(in srgb, currentColor 22%, transparent)) !important; color: var(--rb-table-accent-text, inherit) !important; }
.rb-theme-inherit .tabulator .tabulator-footer { background: transparent !important; color: inherit !important; border-top: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 18%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-footer .tabulator-page { background: var(--rb-table-header-bg, color-mix(in srgb, currentColor 7%, transparent)) !important; color: inherit !important; border: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 18%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-footer .tabulator-page:hover { background: color-mix(in srgb, currentColor 14%, transparent) !important; }
.rb-theme-inherit .tabulator .tabulator-footer .tabulator-page.active { background: var(--rb-table-accent, color-mix(in srgb, currentColor 30%, transparent)) !important; color: var(--rb-table-accent-text, inherit) !important; border-color: var(--rb-table-accent, transparent) !important; }
.rb-theme-inherit .tabulator .tabulator-footer .tabulator-page-size, .rb-theme-inherit .tabulator .tabulator-header-filter input, .rb-theme-inherit .tabulator .tabulator-header-filter select { background: transparent !important; color: inherit !important; border: 1px solid var(--rb-table-border, color-mix(in srgb, currentColor 18%, transparent)) !important; }
.rb-theme-inherit .tabulator .tabulator-col-resize-handle { border-right: 2px solid var(--rb-table-border, color-mix(in srgb, currentColor 12%, transparent)) !important; }
`;

  // Map theme names → embedded CSS strings
  const THEME_CSS_MAP: Record<string, string> = {
    '': lightCSS, 'light': lightCSS, 'default': lightCSS,
    'simple': simpleCSS,
    'midnight': midnightCSS,
    'modern': modernCSS,
    'site-dark': siteDarkCSS,
    'bootstrap3': bootstrap3CSS,
    'bootstrap4': bootstrap4CSS,
    'bootstrap5': bootstrap5CSS,
    'semanticui': semanticuiCSS,
    'bulma': bulmaCSS,
    'materialize': materializeCSS,
    'midnight-site': midnightCSS,
  };

  // Themes that use light text on a dark background
  const DARK_THEMES = new Set(['midnight', 'midnight-site', 'site-dark']);

  // Prefix .tabulator selectors with a wrapper class for CSS isolation.
  // Enables multiple differently-themed tables on the same page.
  function scopeCSS(css: string, scopeClass: string): string {
    return css.replace(/(^|[},]\s*)(\.tabulator)/gm, `$1.${scopeClass} $2`);
  }

  // Strip sourceMappingURL comments from raw CSS strings.
  // The ?raw Vite imports include these from the tabulator-tables package;
  // when injected into <style> tags the browser tries to fetch the .map file → 404.
  function stripSourceMapComment(css: string): string {
    return css.replace(/\/\*#\s*sourceMappingURL=.*?\*\//g, '');
  }

  // DEBUG: counters for lifecycle events
  let _afterUpdateCount = 0;
  let _lastAfterUpdateLogTime = 0;

  let container: HTMLDivElement;
  let table: Tabulator;
  let isReady = false;
  // keep a resolved columns reference (so we can avoid accidental overrides)
  let resolvedColumns: ColumnDefinition[] | undefined;

  // recompute resolved columns reactively when `columns` or `options` prop changes
  $: resolvedColumns = (columns && columns.length) ? columns : ((Array.isArray(options?.columns) && (options as any).columns.length) ? (options as any).columns : undefined);
  const dispatch = createEventDispatcher();

  // Inject Tabulator CSS into document <head>.
  // - No theme / 'light' / 'default' → global injection (default styling)
  // - Named theme → scoped injection with .rb-theme-{name} prefix so the
  //   theme only affects descendants of an opted-in element
  function injectCSS(resolvedTheme: string) {
    // Always inject contrast fix CSS (once) — ensures readable text on any host page
    const contrastId = 'rb-tabulator-contrast-fix';
    if (!document.getElementById(contrastId)) {
      const contrastStyle = document.createElement('style');
      contrastStyle.id = contrastId;
      contrastStyle.textContent = CONTRAST_FIX_CSS;
      document.head.appendChild(contrastStyle);
    }

    // Default (no theme) / 'inherit' → inherit the host theme; 'light' → stock light.
    const isInherit = !resolvedTheme || resolvedTheme === 'default' || resolvedTheme === 'inherit';
    if (isInherit || resolvedTheme === 'light') {
      // Tabulator's structural (layout) CSS — always needed.
      const cssId = 'rb-tabulator-css';
      if (!document.getElementById(cssId)) {
        const style = document.createElement('style');
        style.id = cssId;
        style.textContent = stripSourceMapComment(lightCSS);
        document.head.appendChild(style);
      }
      // Color override: inherit page bg/text, derive structure from currentColor.
      if (isInherit && !document.getElementById('rb-tabulator-inherit')) {
        const style = document.createElement('style');
        style.id = 'rb-tabulator-inherit';
        style.textContent = INHERIT_OVERRIDE_CSS;
        document.head.appendChild(style);
      }
      return;
    }

    // Themed → inject scoped CSS (deduplicated per theme name)
    const scopeClass = `rb-theme-${resolvedTheme}`;
    const cssId = `rb-tabulator-css-${resolvedTheme}`;
    if (document.getElementById(cssId)) return;

    const rawCSS = stripSourceMapComment(THEME_CSS_MAP[resolvedTheme] || lightCSS);
    const style = document.createElement('style');
    style.id = cssId;
    style.textContent = scopeCSS(rawCSS, scopeClass);
    document.head.appendChild(style);

    if (resolvedTheme === 'midnight-site') {
      const siteId = 'rb-tabulator-css-midnight-site-overrides';
      if (!document.getElementById(siteId)) {
        const siteStyle = document.createElement('style');
        siteStyle.id = siteId;
        siteStyle.textContent = scopeCSS(MIDNIGHT_SITE_CSS, scopeClass);
        document.head.appendChild(siteStyle);
      }
    }
  }

  // Default (no theme) / 'inherit' → inherit the host theme via .rb-theme-inherit.
  $: isInheritTheme = !theme || theme === 'default' || theme === 'inherit';

  // Computed theme wrapper class for CSS scoping
  $: themeWrapperClass = isInheritTheme
    ? 'rb-tabulator-root rb-theme-inherit'
    : (theme !== 'light' ? `rb-tabulator-root rb-theme-${theme}` : 'rb-tabulator-root');

  // Text color: inherit (page currentColor) for the inherit theme; explicit for
  // named light/dark themes (Tabulator themes don't set their own text color).
  $: themeTextColor = isInheritTheme ? 'inherit' : (DARK_THEMES.has(theme) ? '#ddd' : '#333');
  // 'inherit' mode keeps the hardcoded contrast-fix CSS (light/dark only) inert.
  $: themeMode = isInheritTheme ? 'inherit' : (DARK_THEMES.has(theme) ? 'dark' : 'light');

  // only once tableBuilt has fired do we sync data/columns
  function updateTable() {
    if (!isReady || !table) return;

    try {
      if (resolvedColumns && resolvedColumns.length) {
        table.setColumns(resolvedColumns);
      }

      // Skip replaceData when data is empty and Tabulator's AJAX module owns the data.
      // In remote pagination mode, calling replaceData([]) would clear AJAX-loaded rows.
      // In spreadsheet mode, data lives in spreadsheetData — replaceData would overwrite it.
      const remotePagination = options?.paginationMode === 'remote' && reportId && apiBaseUrl;
      const isSpreadsheet = (options as any)?.spreadsheet;
      if (Array.isArray(data) && (data.length > 0 || !remotePagination) && !isSpreadsheet) {
        table.replaceData(data);
      }
    } catch (err) {
      console.error('rb-tabulator update error', err);
      dispatch('tableError', { message: String(err) });
    }
  }

  onMount(async () => {
    await tick();

    // Read attributes from host custom element (light DOM — just walk up)
    const hostEl = container?.closest('rb-tabulator');
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
      if (!testMode) {
        const tm = hostEl.getAttribute('test-mode');
        if (tm === 'true' || tm === '') testMode = true;
      }
      if (!theme) theme = hostEl.getAttribute('theme') || '';
    }

    if (!container) {
      dispatch('initError', { message: 'Missing container element' });
      return;
    }

    // ========================================================================
    // Smart Mode: if reportId provided, fetch config + data from server
    // ========================================================================
    if (reportId && apiBaseUrl) {
      loading = true;
      error = null;

      const headers: Record<string, string> = {};
      if (embedToken) headers['X-Embed-Token'] = embedToken;

      try {
        const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
        const config = await fetchConfigCached(configUrl, headers);
        if (componentId && config.namedTabulatorOptions?.[componentId]) {
          options = config.namedTabulatorOptions[componentId];
        } else if (config.tabulatorOptions) {
          options = config.tabulatorOptions;
        }
        if (config.tabulatorDsl) configDsl = config.tabulatorDsl;
        dispatch('configLoaded', { configDsl, config });

        // Skip self-fetch when remote pagination or progressive load is configured
        // — Tabulator's AJAX module will fetch data page-by-page via ajaxURL.
        // Downloading all rows here just to delete them later is wasteful.
        const willUseRemotePagination = options?.paginationMode === 'remote';
        const willUseProgressiveLoad = !!(options as any)?.progressiveLoad;
        const willUseSpreadsheet = !!(options as any)?.spreadsheet;
        if (!willUseRemotePagination && !willUseProgressiveLoad && !willUseSpreadsheet && (!data || !data.length)) {
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
          data = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);
          dispatch('dataFetched', {
            data,
            executionTimeMillis: dataResult?.executionTimeMillis || 0,
            totalRows: dataResult?.totalRows || data.length,
            truncated: dataResult?.truncated || false,
            reportColumnNames: dataResult?.reportColumnNames || [],
          });
        }
      } catch (err: any) {
        error = err.message || 'Failed to load report';
        console.error('rb-tabulator self-fetch error:', err);
        dispatch('fetchError', { message: error });
        loading = false;
        return;
      }
      loading = false;
      await tick();
    }

    // Thin wrapper: pass options straight through to Tabulator.
    const opts: Options = Object.assign({}, options || {});

    // Auto-inject sensible defaults when no explicit configuration provided.
    // Prevents browser freezing on large datasets.
    if (opts.pagination === undefined && !(opts as any).paginationMode && !(opts as any).progressiveLoad && !(opts as any).spreadsheet) {
      opts.pagination = true;
      (opts as any).paginationSize = 50;
      (opts as any).paginationCounter = 'rows';
    }
    // Auto-inject height for Virtual DOM when no height set.
    // Enables Tabulator's virtual renderer (only creates DOM for visible rows).
    if (!opts.height) {
      opts.height = '400px';
    }

    // Extract theme from server config if not set via attribute
    if ((opts as any).theme && !theme) {
      theme = String((opts as any).theme);
    }
    delete (opts as any).theme; // Not a Tabulator constructor option

    // Inject CSS into document head (after theme is resolved)
    injectCSS(theme);

    // Compute resolved columns from explicit columns prop or options
    resolvedColumns = (columns && columns.length) ? columns : ((Array.isArray(opts.columns) && opts.columns.length) ? opts.columns : undefined);

    // Inject data/columns from props if not already in options.
    // Tabulator 6.x: spreadsheets must use spreadsheetData, NOT data.
    if (Array.isArray(data) && data.length && !opts.data) {
      if ((opts as any).spreadsheet) {
        if (!(opts as any).spreadsheetData && !(opts as any).spreadsheetSheets) {
          (opts as any).spreadsheetData = data;
        }
      } else {
        opts.data = data;
      }
    }
    if (resolvedColumns) {
      opts.columns = resolvedColumns;
    }

    // Auto-generate columns from data when no explicit column definitions exist.
    // Covers raw-data viewers where the report defines only pivot/chart options.
    if (opts.data && Array.isArray(opts.data) && opts.data.length > 0
        && !opts.columns && (opts as any).autoColumns === undefined) {
      (opts as any).autoColumns = true;
    }

    // Server-side mode detection
    const isRemotePagination = opts.paginationMode === 'remote' && reportId && apiBaseUrl;
    const isProgressiveLoad = !!(opts as any).progressiveLoad && reportId && apiBaseUrl;
    const isRemoteFilter = opts.filterMode === 'remote' && reportId && apiBaseUrl;
    const isRemoteSort = opts.sortMode === 'remote' && reportId && apiBaseUrl;

    // Graceful downgrade: when remote modes are requested but no server endpoint
    // is available (Mode 1 / data-push), fall back to local equivalents so the
    // table still works with the pre-fetched data.
    if (opts.paginationMode === 'remote' && !isRemotePagination) {
      opts.paginationMode = 'local';
      opts.pagination = true;
      if (!opts.paginationSize) opts.paginationSize = 25;
    }
    if ((opts as any).progressiveLoad && !isProgressiveLoad) {
      delete (opts as any).progressiveLoad;
      opts.pagination = true;
      if (!opts.paginationSize) opts.paginationSize = 25;
    }
    if (opts.filterMode === 'remote' && !isRemoteFilter) {
      opts.filterMode = 'local';
    }
    if (opts.sortMode === 'remote' && !isRemoteSort) {
      opts.sortMode = 'local';
    }

    if (isRemotePagination || isProgressiveLoad) {
      delete opts.data;
    }

    if (isRemotePagination || isProgressiveLoad || isRemoteFilter || isRemoteSort) {
      opts.ajaxURL = `${apiBaseUrl}/reports/${reportId}/data`;

      // Static params Tabulator includes in every request
      const extraParams: Record<string, string> = {};
      if (reportParams) Object.entries(reportParams).forEach(([k, v]) => extraParams[k] = String(v));
      if (testMode) extraParams.testMode = 'true';
      if (componentId) extraParams.componentId = componentId;
      if (Object.keys(extraParams).length > 0) {
        opts.ajaxParams = extraParams;
      }

      // When paginationMode is "remote", Tabulator's Page module intercepts the
      // AJAX response and extracts response.data natively — no help needed.
      // But when ONLY filterMode/sortMode are "remote" (no remote pagination),
      // Page module does NOT intercept, so RowManager receives the full response
      // object and rejects it ("Expecting: array, Received: object").
      // Fix: unwrap the response envelope ourselves via ajaxResponse callback.
      if (!isRemotePagination && !isProgressiveLoad) {
        opts.ajaxResponse = function(_url: string, _params: any, response: any) {
          return Array.isArray(response) ? response : (response?.data || response);
        };
      }
    }

    // === THE ONLY THING THE WRAPPER DOES: create Tabulator on the div ===
    try {
      if (!container) {
        dispatch('initError', { message: 'Container element is null, skipping Tabulator initialization' });
        return;
      }
      table = new Tabulator(container, opts);

      table.on('tableBuilt', () => {
        isReady = true;
        dispatch('ready', { table });
        // sync any props that arrived before build
        updateTable();
      });
      table.on('rowClick', (e, row) => dispatch('rowClick', { event: e, row, rowData: row.getData() }));
      table.on('dataLoaded', (d) => dispatch('dataLoaded', { data: d }));
      table.on('dataFiltered', (filters: any[], rows: any[]) => dispatch('dataFiltered', { filters, rowCount: rows.length }));
    } catch (err) {
      console.error('rb-tabulator init error', err);
      dispatch('initError', { message: String(err) });
    }
  });

  afterUpdate(() => {
    _afterUpdateCount++;
    const now = Date.now();
    // Log at most once per second
    if (now - _lastAfterUpdateLogTime > 1000) {
      // console.log('[DEBUG] rb-tabulator afterUpdate called', _afterUpdateCount, 'times total');
      _lastAfterUpdateLogTime = now;
    }
    // Warn if called excessively
    if (_afterUpdateCount > 100 && _afterUpdateCount % 100 === 0) {
      console.warn('[DEBUG] WARNING: rb-tabulator afterUpdate called', _afterUpdateCount, 'times - possible infinite loop!');
    }
    updateTable();
  });

  onDestroy(() => {
    if (table) {
      try {
        table.destroy();
        table = null;
      } catch (err) {
        console.error('Error destroying table:', err);
      }
    }
  });

  export { updateTable as updateTable };

  export function redraw() {
    if (table) table.redraw(true);
  }

  export async function fetchData(params: Record<string, any> = {}) {
    if (!reportId || !apiBaseUrl) {
      console.warn('rb-tabulator: fetchData requires reportId and apiBaseUrl');
      return;
    }

    loading = true;
    const headers: Record<string, string> = {};
      if (embedToken) headers['X-Embed-Token'] = embedToken;

    try {
      const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
      const config = await fetchConfigCached(configUrl, headers);

      if (componentId && config.namedTabulatorOptions?.[componentId]) {
        options = config.namedTabulatorOptions[componentId];
      } else if (config.tabulatorOptions) {
        options = config.tabulatorOptions;
      }
      // Update resolved columns from new config
      resolvedColumns = (columns && columns.length) ? columns :
        ((Array.isArray(options?.columns) && options.columns.length) ? options.columns : undefined);
      if (config.tabulatorDsl) {
        configDsl = config.tabulatorDsl;
      }

      const dataParams = new URLSearchParams(params as Record<string, string>);
      if (componentId) dataParams.set('componentId', componentId);
      const queryString = dataParams.toString();
      const url = queryString
        ? `${apiBaseUrl}/reports/${reportId}/data?${queryString}`
        : `${apiBaseUrl}/reports/${reportId}/data`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
      const dataResult = await res.json();
      data = Array.isArray(dataResult) ? dataResult : (dataResult?.data || []);

      if (isReady && table) {
        if (resolvedColumns && resolvedColumns.length) {
          table.setColumns(resolvedColumns);
        }
        table.replaceData(data);
      }

      dispatch('dataFetched', {
        data,
        executionTimeMillis: dataResult?.executionTimeMillis || 0,
        totalRows: dataResult?.totalRows || data.length,
        truncated: dataResult?.truncated || false,
        reportColumnNames: dataResult?.reportColumnNames || [],
      });
    } catch (err: any) {
      error = err.message || 'Failed to fetch data';
      dispatch('fetchError', { message: error });
    }
    loading = false;
  }
</script>

<div class={themeWrapperClass} data-rb-theme-mode={themeMode} style:color={themeTextColor}>
  {#if loading}
    <div class="rb-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading...</div>
  {/if}
  {#if error}
    <div class="rb-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
  {/if}
  <div bind:this={container} id={componentId ? `widgetTabulator-${componentId}` : undefined} style:display={loading || error ? 'none' : 'block'}></div>
</div>

<style>
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

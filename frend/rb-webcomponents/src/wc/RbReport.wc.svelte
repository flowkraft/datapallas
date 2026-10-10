<svelte:options customElement={{ tag: "rb-report", shadow: "none" }} accessors={true} />

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { prepareDashboardHtml } from '../shared/dashboard-injection';

  // ============================================================================
  // Minimal Interface - Only 3 required props!
  // ============================================================================
  
  /** Report folder name (e.g., "sales-summary") */
  export let reportId: string = '';
  
  /** Base URL for API calls (e.g., "http://localhost:9090/api") */
  export let apiBaseUrl: string = '';
  
  /** API key for authentication (passed from host app) */
  export let apiKey: string = '';
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  
  /** Optional: Entity code for single-entity HTML document rendering */
  export let entityCode: string = '';
  
  /** Optional: Show print/download button in entity mode */
  export let showPrintButton: boolean = false;
  
  /** Optional: Custom label for the print button (default: 'Print') */
  export let printButtonLabel: string = 'Print';

  /**
   * Optional: wait for the reader to scroll here before asking for anything.
   *
   * A page that shows many dashboards at once - the Dashboard Demos gallery shows 25 - would
   * otherwise make every config and data call, and draw every chart, on open. With `lazy`, this
   * dashboard's config is fetched once the element comes within one screen of the viewport, and
   * from then on it behaves exactly as it does without the attribute. Nothing changes for a page
   * that does not set it.
   */
  export let lazy: boolean = false;

  /**
   * Optional: list the questions this dashboard was written to answer, above its filter bar.
   *
   * The dashboard's own config carries them (`stories`, from its `<report id>-stories.json`), and
   * each one is a Show Me that sets this dashboard's filters to the story's values and reloads this
   * dashboard alone - like a cube's hints, and with the same look. Without the attribute nothing
   * changes: a demo's own page, and every existing dashboard, look exactly as they do today.
   */
  export let showStories: boolean = false;
  
  // ============================================================================
  // Internal State
  // ============================================================================
  
  let config: any = null;
  let reportData: any[] = [];
  let renderedHtml: string = '';
  let loading = false;
  let configLoaded = false;
  let dataLoaded = false;
  let error: string | null = null;

  // Dashboard mode state
  let dashboardTemplate: string = '';
  let dashboardContainer: HTMLDivElement;
  let currentDashboardParams: Record<string, any> = {};

  /** The stories the config carries, and the one the reader asked last (marked, as a cube marks it). */
  let stories: any[] = [];
  let lastAskedId: string | null = null;

  // Track previous entityCode to detect changes
  let prevEntityCode: string = '';
  
  // Parameter values (collected from form)
  let parameterValues: Record<string, any> = {};
  
  // Component refs
  let container: HTMLDivElement;
  let tabulatorEl: any;
  let chartEl: any;
  let pivotEl: any;
  let parametersEl: any;
  let reportIframe: HTMLIFrameElement;

  // Counter to force re-render of named components on param re-submit
  let fetchCounter = 0;

  // Lazy mode: has the dashboard come within one screen of the viewport yet? Without `lazy` there
  // is nothing to wait for, so it starts true and every watcher below reads as it did before.
  // Read here, not in `onMount`, so a page that passes `lazy` as a prop (rather than as an
  // attribute) also waits: the watchers below run once during init, before `onMount`.
  let scrolledTo = !lazy;
  let lazyObserver: IntersectionObserver | null = null;
  
  // ============================================================================
  // Lifecycle
  // ============================================================================
  
  onMount(async () => {
    // console.log('[RbReport] onMount - reportId:', reportId, 'apiBaseUrl:', apiBaseUrl, 'entityCode:', entityCode);
    
    // Read attributes from host custom element (light DOM — walk up, same as RbTabulator)
    await tick();
    const hostElement = container?.closest('rb-report') || container?.closest('rb-dashboard');
    // console.log('[RbReport] onMount - hostElement:', hostElement);

    if (hostElement) {
      if (!reportId) reportId = hostElement.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostElement.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostElement.getAttribute('api-key') || '';
      if (!embedToken) embedToken = hostElement.getAttribute('embed-token') || '';
      if (!entityCode) entityCode = hostElement.getAttribute('entity-code') || '';
      // A boolean attribute: `lazy` and `lazy="true"` both mean yes, as `show-print-button` does.
      if (hostElement.hasAttribute('lazy')) {
        const lazyAttr = hostElement.getAttribute('lazy');
        lazy = lazyAttr === '' || lazyAttr === 'true';
      }
      // A boolean attribute, read like `lazy`: `show-stories` and `show-stories="true"` both mean yes.
      if (hostElement.hasAttribute('show-stories')) {
        const storiesAttr = hostElement.getAttribute('show-stories');
        showStories = storiesAttr === '' || storiesAttr === 'true';
      }
      if (hostElement.hasAttribute('show-print-button')) {
        const printAttr = hostElement.getAttribute('show-print-button');
        showPrintButton = printAttr === '' || printAttr === 'true';
      }
    }
    // Read print-button-label attribute
    if (hostElement && hostElement.hasAttribute('print-button-label')) {
      printButtonLabel = hostElement.getAttribute('print-button-label') || 'Print';
      // console.log('[RbReport] onMount - read print-button-label from attribute:', printButtonLabel);
    }
    
    // console.log('[RbReport] onMount - after attribute read: reportId:', reportId, 'apiBaseUrl:', apiBaseUrl, 'entityCode:', entityCode);
    
    if (lazy) {
      // Nothing is asked for yet: the watchers below wait for `scrolledTo`, which the observer
      // sets once. This returns instead of fetching, so an offscreen dashboard costs one observer.
      scrolledTo = false;
      startLazyWatch(hostElement);
      return;
    }

    if (reportId && apiBaseUrl) {
      // In entity mode, skip config loading and directly fetch data with entityCode
      if (entityCode) {
        // console.log('[RbReport] onMount - entity mode, calling fetchData()');
        await fetchData();
      } else {
        // console.log('[RbReport] onMount - normal mode, calling loadConfig()');
        await loadConfig();
      }
    } else {
      console.warn('[RbReport] onMount - missing reportId or apiBaseUrl, not fetching');
    }
  });
  
  /**
   * One screen of margin, so a dashboard is asked for just before the reader reaches it and the
   * widgets are there by the time it is on screen. Inside the datapallas.com iframe this watches
   * the frame's own viewport - the one the reader scrolls.
   *
   * Where there is no `IntersectionObserver` - an old browser, a page rendered without a viewport -
   * the dashboard loads at once, exactly as without the attribute: one that never loaded would be
   * worse than one loaded early.
   */
  function startLazyWatch(element: Element | null) {
    if (!element || typeof IntersectionObserver === 'undefined') {
      scrolledTo = true;
      return;
    }
    const screen = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800;
    lazyObserver = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      // Once: from here on this dashboard behaves exactly as one without the attribute.
      scrolledTo = true;
      lazyObserver?.disconnect();
      lazyObserver = null;
    }, { rootMargin: `${screen}px 0px` });
    lazyObserver.observe(element);
  }

  // Watch for prop changes
  $: if (reportId && apiBaseUrl && scrolledTo && !configLoaded && !entityCode) {
    // console.log('[RbReport] prop watcher triggered - loadConfig()');
    loadConfig();
  }
  
  // Watch for entityCode changes - fetch data directly in entity mode
  // Use prevEntityCode to detect actual changes and re-fetch
  $: if (reportId && apiBaseUrl && scrolledTo && entityCode && entityCode !== prevEntityCode) {
    // console.log('[RbReport] entityCode watcher triggered - entityCode:', entityCode, 'prevEntityCode:', prevEntityCode);
    prevEntityCode = entityCode;
    dataLoaded = false; // Reset to allow fresh fetch
    fetchData();
  }
  
  // ============================================================================
  // API Calls
  // ============================================================================
  
  async function loadConfig() {
    if (!reportId || !apiBaseUrl) return;
    
    loading = true;
    error = null;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // TEMP: API key disabled for rollback
      // if (apiKey) {
      //   headers['X-API-Key'] = apiKey;
      // }
      if (embedToken) headers['X-Embed-Token'] = embedToken;
      
      const response = await fetch(`${apiBaseUrl}/reports/${reportId}/config`, { headers });
      
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status}`);
      }
      
      config = await response.json();
      configLoaded = true;

      // The questions this dashboard was written to answer, if its folder ships them. A dashboard
      // with no stories file answers without the field, and this stays empty.
      stories = Array.isArray(config.stories) ? config.stories : [];

      // Dashboard mode: config includes raw HTML template with embedded web components
      if (config.dashboardTemplate) {
        dashboardTemplate = config.dashboardTemplate;
        loading = false;
        return; // Dashboard renders via innerHTML, no data fetch needed
      }

      // Initialize parameter values with defaults
      if (config.parameters) {
        config.parameters.forEach((p: any) => {
          parameterValues[p.id] = p.defaultValue ?? getDefaultForType(p.type);
        });
      }
      
      // If no parameters, fetch data immediately
      if (!config.hasParameters) {
        await fetchData();
      }
      
    } catch (e: any) {
      error = e.message || 'Failed to load report configuration';
      console.error(`rb-report: loadConfig error for ${reportId}`, e);
    } finally {
      loading = false;
    }
  }
  
  async function fetchData() {
    // console.log('[RbReport] fetchData called - reportId:', reportId, 'apiBaseUrl:', apiBaseUrl, 'entityCode:', entityCode);
    
    if (!reportId || !apiBaseUrl) {
      console.warn('[RbReport] fetchData - missing reportId or apiBaseUrl, returning');
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // TEMP: API key disabled for rollback
      // if (apiKey) {
      //   headers['X-API-Key'] = apiKey;
      // }
      if (embedToken) headers['X-Embed-Token'] = embedToken;
      
      // Build query string from parameters
      const params = new URLSearchParams();
      
      // Include entityCode if present (for single-entity HTML rendering)
      if (entityCode) {
        // console.log('[RbReport] fetchData - adding entityCode to params:', entityCode);
        params.set('entityCode', entityCode);
      }
      
      Object.entries(parameterValues).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      });
      
      const url = `${apiBaseUrl}/reports/${reportId}/data?${params.toString()}`;
      // console.log('[RbReport] fetchData - fetching from URL:', url);
      
      const response = await fetch(url, { headers });
      // console.log('[RbReport] fetchData - response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }
      
      const result = await response.json();
      // console.log('[RbReport] fetchData - result:', result);
      // console.log('[RbReport] fetchData - data length:', result.data?.length);
      // console.log('[RbReport] fetchData - renderedHtml length:', result.renderedHtml?.length);

      reportData = result.data || [];
      renderedHtml = result.renderedHtml || '';
      dataLoaded = true;
      fetchCounter++; // Force re-render of named components on re-fetch
      
      // console.log('[RbReport] fetchData - dataLoaded set to true, renderedHtml:', renderedHtml ? renderedHtml.substring(0, 200) + '...' : 'empty');
      
      // After data loaded, update child components
      await tick();
      updateVisualizations();
      
    } catch (e: any) {
      error = e.message || 'Failed to fetch report data';
      console.error('rb-report: fetchData error', e);
    } finally {
      loading = false;
    }
  }
  
  // ============================================================================
  // Helpers
  // ============================================================================
  
  function getDefaultForType(type: string): any {
    const t = (type || '').toLowerCase();
    if (t === 'boolean') return false;
    if (t === 'integer' || t === 'decimal') return null;
    return '';
  }
  
  /**
   * Print the rendered HTML report.
   * Opens a new window with the HTML content and triggers the print dialog.
   * Users can print to paper or save as PDF using their browser's print dialog.
   */
  function printReport() {
    if (!renderedHtml) {
      console.warn('[RbReport] printReport - no renderedHtml available');
      return;
    }
    
    // Open a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      console.error('[RbReport] printReport - failed to open print window (popup blocked?)');
      alert('Please allow popups for this site to enable printing.');
      return;
    }
    
    // Write the HTML content to the new window
    printWindow.document.open();
    printWindow.document.write(renderedHtml);
    printWindow.document.close();
    
    // Wait for content to load, then trigger print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      // Note: We don't close the window automatically so users can 
      // review the document or try printing again if needed
    };
    
    // Fallback: trigger print after a short delay if onload doesn't fire
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }
  
  function handleParameterChange(e: CustomEvent) {
    if (e.detail?.values) {
      parameterValues = { ...e.detail.values };
    }
  }
  
  function handleParameterSubmit(e: CustomEvent) {
    if (e.detail?.values) {
      parameterValues = { ...e.detail.values };
    }
    fetchData();
  }
  
  function updateVisualizations() {
    // Update Tabulator
    if (tabulatorEl && config?.hasTabulator) {
      tabulatorEl.data = reportData;
      if (config.tabulatorOptions?.columns) {
        tabulatorEl.columns = config.tabulatorOptions.columns;
      }
      // tabulatorOptions is now a flat map matching tabulator.info API directly
      tabulatorEl.options = config.tabulatorOptions || {};
    }
    
    // Update Chart
    if (chartEl && config?.hasChart) {
      const chartConfig = config.chartOptions || {};
      
      // Transform data for Chart.js format
      const chartData = transformToChartData(reportData, chartConfig);
      chartEl.data = chartData;
      
      if (chartConfig.type) {
        chartEl.type = chartConfig.type;
      }
      if (chartConfig.options) {
        chartEl.options = chartConfig.options;
      }
    }
    
    // Update Pivot Table
    if (pivotEl && config?.hasPivotTable) {
      pivotEl.data = reportData;
      const pivotOpts = config.pivotTableOptions || {};
      if (pivotOpts.rows) pivotEl.rows = pivotOpts.rows;
      if (pivotOpts.cols) pivotEl.cols = pivotOpts.cols;
      if (pivotOpts.vals) pivotEl.vals = pivotOpts.vals;
      if (pivotOpts.aggregatorName) pivotEl.aggregatorName = pivotOpts.aggregatorName;
      if (pivotOpts.rendererName) pivotEl.rendererName = pivotOpts.rendererName;
    }
  }
  
  // Dashboard mode: inject HTML into DOM when container is ready
  let dashboardHasParameters = false;
  let dashboardInitialParamsReceived = false;

  function injectDashboard(fullInject: boolean = true) {
    if (!dashboardContainer || !dashboardTemplate) return;

    if (fullInject) {
      // Every rb-* widget inside the template fetches its own config and data on mount, reading
      // its credential and its API base from its own attributes. Neither inherits from this
      // element, so both are written onto the widgets here — otherwise a dashboard opened through
      // a share link renders its frame and nothing else. See ../shared/dashboard-injection.
      dashboardContainer.innerHTML = prepareDashboardHtml(dashboardTemplate, {
        reportId,
        apiBaseUrl,
        embedToken,
        reportParams: currentDashboardParams,
      });
    }

    // Listen for parameter events from rb-parameters inside the dashboard.
    // Guard against stacking listeners if injectDashboard runs repeatedly:
    // remove first, add once. onDestroy does a final remove.
    dashboardContainer.removeEventListener('valueChange', handleDashboardParamChange as EventListener);
    dashboardContainer.removeEventListener('submit', handleDashboardParamSubmit as EventListener);
    dashboardContainer.addEventListener('valueChange', handleDashboardParamChange as EventListener);
    dashboardContainer.addEventListener('submit', handleDashboardParamSubmit as EventListener);

    // A link to something inside a collapsed section has to open that section, on load and every
    // time the hash changes afterwards.
    if (typeof window !== 'undefined') {
      window.removeEventListener('hashchange', openHashTarget);
      window.addEventListener('hashchange', openHashTarget);
    }
    // `toggle` does not bubble, so a panel anywhere in the dashboard is heard on the way down.
    dashboardContainer.removeEventListener('toggle', handlePanelOpened, true);
    dashboardContainer.addEventListener('toggle', handlePanelOpened, true);
    openHashTarget();
  }

  /**
   * A tile in a panel that was closed gets its size when the panel opens.
   *
   * A widget that mounted inside a closed `<details>` measured a box of no size, and charts and
   * tables draw themselves to the box they measured. Both redraw when their container changes size,
   * and both take a window resize as the signal to look again, so that is what an opened panel
   * sends - once, on the frame the panel is laid out in, for whatever is inside it.
   */
  function handlePanelOpened(event: Event) {
    const panel = event.target as HTMLElement | null;
    if (!panel || panel.tagName !== 'DETAILS' || !(panel as HTMLDetailsElement).open) return;
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  /**
   * A link to a card inside a collapsed panel opens that panel, then scrolls to the card.
   *
   * A dashboard may lay its content out in `<details>` panels - sample 21's industries do, one open
   * at a time - and a URL like `#cube-online-sales` names a card inside one of them. A browser will
   * not scroll to something in a closed panel, so the visitor lands at the top of the page instead
   * of on the card the link promised them. Nothing in that is particular to one dashboard, and a
   * dashboard template carries no script of its own, so it is done here, once, for every dashboard.
   *
   * Outermost panel first: opening one panel of a group (`<details name="...">`) closes its
   * siblings, so an inner panel opened before its parent would be shut again by the parent's own
   * group.
   */
  function openHashTarget() {
    if (typeof window === 'undefined' || !dashboardContainer) return;
    const id = window.location.hash.slice(1);
    if (!id) return;

    let target: HTMLElement | null = null;
    try {
      target = dashboardContainer.querySelector<HTMLElement>(`#${CSS.escape(decodeURIComponent(id))}`);
    } catch {
      return; // a hash that is not an id at all is not ours to act on
    }
    if (!target) return;

    const panels: HTMLDetailsElement[] = [];
    for (
      let panel = target.closest('details');
      panel && dashboardContainer.contains(panel);
      panel = panel.parentElement?.closest('details') ?? null
    ) {
      panels.unshift(panel);
    }
    for (const panel of panels) panel.open = true;

    // The card is laid out only once the panel is open, and its widget grows into the space after
    // that, so the scroll waits for the frame the opened panel is drawn in.
    const scrollTo = target;
    window.requestAnimationFrame(() => scrollTo.scrollIntoView({ block: 'start' }));
  }

  /**
   * The filter bar of THIS dashboard: the `rb-parameters` the template puts inside it.
   *
   * A story sets that one bar and reloads that one dashboard - on the Gallery, 25 dashboards sit on
   * one page, and none of them is any other's to touch. A nested `<rb-dashboard>` brings its own
   * bar, so the first one inside this container is this dashboard's own.
   */
  function ownParameters(): any {
    return dashboardContainer?.querySelector('rb-parameters') as any;
  }

  /** Whether there is anything to show: the attribute, and stories in the config. */
  $: offersStories = showStories && stories.length > 0;

  /**
   * Show Me: the story's values, set as if the reader had picked them, and this dashboard reloaded.
   *
   * `setValues` is where the validation lives (`shared/url-start-values.ts`, shared with the values
   * a page URL carries): an unknown name or a value outside a filter's options is ignored with one
   * warning, and a locked parameter keeps the link's value. The page does not navigate.
   */
  function showMe(story: any) {
    const params = ownParameters();
    if (!params || typeof params.setValues !== 'function') {
      console.warn('[RbReport] Show Me: this dashboard has no filter bar to set');
      return;
    }
    lastAskedId = story?.id ?? null;
    params.setValues(story?.params || {});
    params.reloadNow();
  }

  /** Reset: this dashboard's own defaults, and the same reload. */
  function resetStories() {
    const params = ownParameters();
    if (!params || typeof params.reset !== 'function') {
      console.warn('[RbReport] Reset: this dashboard has no filter bar to reset');
      return;
    }
    lastAskedId = null;
    params.reset();
    params.reloadNow();
  }

  function handleDashboardParamChange(e: CustomEvent) {
    currentDashboardParams = e.detail || {};

    // First valueChange = defaults loaded. If we haven't rendered visualizations yet, do it now.
    if (dashboardHasParameters && !dashboardInitialParamsReceived) {
      dashboardInitialParamsReceived = true;
      injectDashboard(); // Re-inject full dashboard with default param values on all rb-* components
    }
  }

  function handleDashboardParamSubmit(e: CustomEvent) {
    // console.log('[RbReport] handleDashboardParamSubmit - received submit event, detail:', e.detail);
    currentDashboardParams = e.detail || {};
    // Do NOT call injectDashboard() here — that would destroy and re-create ALL elements
    // (including rb-parameters itself, resetting the user's selections).
    // rb-parameters.confirmReload() already handles replacing sibling rb-* components
    // with fresh elements that carry the updated report-params attribute.
  }

  $: if (dashboardContainer && dashboardTemplate) {
    // Single code flow: inject the full dashboard HTML, with this element's credential, API base
    // and parameters written onto the widgets. All web components (rb-parameters, rb-tabulator,
    // rb-chart, rb-pivot-table) are self-contained and fetch their own data on mount, which is
    // exactly why they have to be handed what to fetch it with.
    // Listener attachment happens inside injectDashboard() with a
    // remove-before-add guard; no need to add again here.
    injectDashboard();
  }

  onDestroy(() => {
    if (dashboardContainer) {
      dashboardContainer.removeEventListener('valueChange', handleDashboardParamChange as EventListener);
      dashboardContainer.removeEventListener('submit', handleDashboardParamSubmit as EventListener);
    }
    if (dashboardContainer) {
      dashboardContainer.removeEventListener('toggle', handlePanelOpened, true);
    }
    if (typeof window !== 'undefined') window.removeEventListener('hashchange', openHashTarget);
    lazyObserver?.disconnect();
    lazyObserver = null;
  });

  // Helpers for aggregator reports — extract named component IDs from config
  $: namedTabulatorIds = config?.namedTabulatorOptions ? Object.keys(config.namedTabulatorOptions) : [];
  $: namedChartIds = config?.namedChartOptions ? Object.keys(config.namedChartOptions) : [];
  $: namedPivotIds = config?.namedPivotTableOptions ? Object.keys(config.namedPivotTableOptions) : [];
  $: hasNamedComponents = namedTabulatorIds.length > 0 || namedChartIds.length > 0 || namedPivotIds.length > 0;

  function transformToChartData(data: any[], chartConfig: any) {
    if (!data || data.length === 0) return { labels: [], datasets: [] };
    
    const labelField = chartConfig.labelField || Object.keys(data[0])[0];
    const labels = data.map((row: any) => row[labelField] != null ? String(row[labelField]) : '');
    
    const datasets = (chartConfig.datasets || []).map((ds: any) => {
      const field = ds.field;
      if (!field) return ds;
      
      const dataValues = data.map((row: any) => {
        const val = row[field];
        if (val == null) return null;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const num = Number(val);
          return isNaN(num) ? null : num;
        }
        return val;
      });
      
      const result = { ...ds };
      delete result.field;
      result.data = dataValues;
      if (!result.label) result.label = field;
      
      if (result.color) {
        if (!result.borderColor) result.borderColor = result.color;
        if (!result.backgroundColor) result.backgroundColor = result.color;
        delete result.color;
      }
      
      return result;
    });
    
    return { labels, datasets };
  }

  // Theme the report document FROM OUTSIDE: make its page (html/body) background
  // transparent so the host page (or a --rb-report-paper the host sets on
  // <rb-report>) shows through. The report's own card/sections keep their
  // template styling. No daisyUI/Tailwind is hardcoded in this component.
  function withThemedReportBackground(html: string): string {
    if (!html) return html;
    const inject = '<style>html,body{background:transparent !important;}</style>';
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, (m) => m + inject);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, (m) => m + inject);
    return inject + html;
  }
  $: themedReportHtml = withThemedReportBackground(renderedHtml);
</script>

<div bind:this={container} class="rb-report">
  {#if loading}
    <div class="rb-report-loading" id="widgetLoading">
      <div class="rb-report-spinner"></div>
      <span>Loading...</span>
    </div>
  {/if}
  
  {#if error}
    <div class="rb-report-error" id="widgetError">
      <strong>Error:</strong> {error}
    </div>
  {/if}
  
  <!-- The questions this dashboard was written to answer, above its filter bar: a cube's hints,
       for a dashboard. Plain text, never `{@html}` - a stories file writes no markup. -->
  {#if configLoaded && dashboardTemplate && !error && offersStories}
    <div id="stories-{reportId}" class="rb-hints">
      {#each stories as story (story.id)}
        <div id="story-{reportId}-{story.id}" class="rb-hint" class:rb-hint-asked={story.id === lastAskedId}>
          <div class="rb-hint-question">{story.question}</div>
          <div class="rb-hint-text">{story.text}</div>
          <button type="button" id="btnShowMe-{reportId}-{story.id}" class="rb-hint-showme"
                  title="Set the filters this question asks for" on:click={() => showMe(story)}>Show Me</button>
        </div>
      {/each}
      <!-- One Reset for the dashboard, not one per story: it puts every filter back to its default. -->
      <div class="rb-hint-reset">
        <button type="button" id="btnStoryReset-{reportId}" class="rb-hint-showme"
                title="Put the filters back to their defaults" on:click={resetStories}>Reset</button>
      </div>
    </div>
  {/if}

  <!-- Dashboard Mode: Inject HTML with live web components into DOM -->
  {#if configLoaded && dashboardTemplate && !error}
    <div class="rb-report-dashboard" id="widgetReport" bind:this={dashboardContainer}></div>
  {/if}

  {#if configLoaded && !dashboardTemplate && !error}
    <!-- Parameters Section -->
    {#if config.hasParameters}
      <div class="rb-report-section rb-report-parameters">
        <rb-parameters
          bind:this={parametersEl}
          parameters={config.parameters}
          on:change={handleParameterChange}
          on:submit={handleParameterSubmit}
        ></rb-parameters>
        <button class="rb-report-run-btn" on:click={() => fetchData()} disabled={loading}>
          {loading ? 'Loading...' : 'Run Report'}
        </button>
      </div>
    {/if}
    
    <!-- Visualizations Section (only show after data loaded) -->
    {#if dataLoaded}
      <div class="rb-report-visualizations">
        <!-- Unnamed components (standard report - data pushed from RbReport) -->
        {#if config.hasTabulator && namedTabulatorIds.length === 0}
          <div class="rb-report-section rb-report-table">
            <rb-tabulator bind:this={tabulatorEl}></rb-tabulator>
          </div>
        {/if}

        {#if config.hasChart && namedChartIds.length === 0}
          <div class="rb-report-section rb-report-chart">
            <rb-chart bind:this={chartEl}></rb-chart>
          </div>
        {/if}

        {#if config.hasPivotTable && namedPivotIds.length === 0}
          <div class="rb-report-section rb-report-pivot">
            <rb-pivot-table bind:this={pivotEl}></rb-pivot-table>
          </div>
        {/if}

        <!-- Named components (aggregator report - each self-fetches with componentId) -->
        {#key fetchCounter}
          {#each namedTabulatorIds as cid}
            <div class="rb-report-section rb-report-table">
              <rb-tabulator
                report-id={reportId}
                component-id={cid}
                api-base-url={apiBaseUrl}
                api-key={apiKey}
                report-params={JSON.stringify(parameterValues)}
                preview-limit="0"
              ></rb-tabulator>
            </div>
          {/each}

          {#each namedChartIds as cid}
            <div class="rb-report-section rb-report-chart">
              <rb-chart
                report-id={reportId}
                component-id={cid}
                api-base-url={apiBaseUrl}
                api-key={apiKey}
                report-params={JSON.stringify(parameterValues)}
                preview-limit="0"
              ></rb-chart>
            </div>
          {/each}

          {#each namedPivotIds as cid}
            <div class="rb-report-section rb-report-pivot">
              <rb-pivot-table
                report-id={reportId}
                component-id={cid}
                api-base-url={apiBaseUrl}
                api-key={apiKey}
                report-params={JSON.stringify(parameterValues)}
                preview-limit="0"
              ></rb-pivot-table>
            </div>
          {/each}
        {/key}
      </div>
    {/if}
  {/if}
  
  <!-- Entity Mode: Display rendered HTML in iframe -->
  {#if entityCode && dataLoaded && renderedHtml}
    <div class="rb-report-entity-html">
      {#if showPrintButton}
        <div class="rb-report-print-toolbar">
          <button class="rb-report-print-btn" on:click={printReport} title="Print or Save as PDF">
            <svg class="rb-report-print-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9V2h12v7"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {printButtonLabel}
          </button>
        </div>
      {/if}
      <iframe 
        bind:this={reportIframe}
        class="rb-report-iframe"
        srcdoc={themedReportHtml}
        title="Report for {entityCode}"
        sandbox="allow-same-origin allow-scripts allow-modals"
      ></iframe>
    </div>
  {/if}
  
  {#if entityCode && dataLoaded && !renderedHtml && !error}
    <div class="rb-report-no-content">
      No HTML content available for entity: {entityCode}
    </div>
  {/if}
</div>

<style>
  /* Theme-inheriting & framework-agnostic: the component's OWN chrome (container,
     toolbar, buttons, sections) inherits the page; text uses currentColor and
     structure derives from currentColor via color-mix. The backend-generated
     report HTML (rendered in the iframe) is NOT styled here. A host MAY override:
     rb-report { --rb-border / --rb-accent / --rb-accent-text }. No daisyUI / Tailwind. */
  .rb-report {
    width: 100%;
    font-family: system-ui, -apple-system, sans-serif;
    background: transparent;
    color: inherit;
  }

  .rb-report-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    color: var(--color-base-content, #666);
  }

  .rb-report-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-base-300, #e0e0e0);
    border-top-color: var(--color-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .rb-report-error {
    padding: 12px 16px;
    background: var(--color-base-100, #fef2f2);
    border: 1px solid var(--color-error, #fecaca);
    border-radius: 4px;
    color: var(--color-error, #b91c1c);
    margin-bottom: 16px;
  }
  
  .rb-report-section {
    margin-bottom: 24px;
  }
  
  .rb-report-parameters {
    padding: 16px;
    background: var(--color-base-200, color-mix(in srgb, currentColor 5%, transparent));
    border-radius: 8px;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 14%, transparent));
  }

  .rb-report-run-btn {
    margin-top: 12px;
    padding: 8px 16px;
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .rb-report-run-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .rb-report-run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .rb-report-visualizations {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  
  .rb-report-dashboard {
    width: 100%;
  }

  /* The stories, in the look `RbCubeRenderer` gives a cube's hints (`rb-hints`, `rb-hint`,
     `rb-hint-showme`), copied here so the Gallery and Cube Stories look alike. */
  .rb-hints {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0;
  }

  .rb-hint {
    border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
    border-radius: 6px;
    padding: 8px 10px;
  }

  /* The story the reader asked last, marked while its values are the ones on screen. */
  .rb-hint-asked {
    border-color: color-mix(in oklab, currentColor 45%, transparent);
    background: color-mix(in oklab, currentColor 6%, transparent);
  }

  .rb-hint-question {
    font-weight: 600;
  }

  .rb-hint-text {
    font-size: 12px;
    color: color-mix(in oklab, currentColor 70%, transparent);
    margin: 2px 0 6px;
  }

  .rb-hint-showme {
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12px;
    padding: 3px 10px;
    cursor: pointer;
  }

  .rb-report-entity-html {
    width: 100%;
    min-height: 400px;
  }
  
  .rb-report-iframe {
    width: 100%;
    min-height: 600px;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 14%, transparent));
    border-radius: 4px;
    /* No hardcoded paper color — the document page is themed FROM OUTSIDE: the
       host page shows through by default, or a host may set --rb-report-paper
       on <rb-report>. The report's own card/sections keep their template look. */
    background: var(--rb-report-paper, transparent);
  }
  
  .rb-report-no-content {
    padding: 16px;
    background: var(--color-base-100, #fef3c7);
    border: 1px solid var(--color-warning, #fcd34d);
    border-radius: 4px;
    color: var(--color-warning, #92400e);
  }
  
  .rb-report-print-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 0;
    margin-bottom: 8px;
  }
  
  .rb-report-print-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: opacity 0.2s;
  }

  .rb-report-print-btn:hover {
    opacity: 0.9;
  }

  .rb-report-print-btn:active {
    opacity: 0.8;
  }
  
  .rb-report-print-icon {
    width: 18px;
    height: 18px;
  }
</style>

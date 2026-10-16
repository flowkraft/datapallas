<svelte:options customElement={{ tag: "rb-report", shadow: "none" }} accessors={true} />

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { prepareDashboardHtml, hasFilterBar } from '../shared/dashboard-injection';
  import { openingValues } from '../shared/url-start-values';
  // The "⋯" menu on each tile (#19): added here, where every published dashboard is put on the page.
  import { decorateTiles } from '../shared/tile-menu';
  import { closeOthersOfGroup } from '../shared/panel-group';
  // A click on a bar or a table row opens the rows behind it (#21).
  import { wireDrillThrough } from '../shared/drill-through';
  import { wireNoData } from '../shared/no-data';
  // How often the dashboard asks its data again by itself, as its author set it (#22).
  import { autoRefreshMinutesOf } from '../shared/auto-refresh';
  import { storyToastLines } from '../shared/story-summary';
  import { fieldOf, SLICER_TAG, slicerFieldsOnPage, slicerSelectionsFor, refreshDataWidgets,
           CROSS_FILTER_EVENT, DATA_WIDGET_TAGS,
           type SlicerSelection } from '../shared/slicer-selections';

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
  /** The story whose "Apply the filter values?" Yes / No is open, and what it would change. */
  let confirmStoryId = '';
  /** What that Yes would set, filter by filter: shown in the gate so the reader knows what they are agreeing to. */
  let pendingChanges: { id: string; label: string; to: string; toFull: string }[] = [];
  /** What the story on screen set, kept so a No on another story gives its marks back. */
  let appliedMarks: { involved: string[]; changes: any[] } | null = null;
  /** True while Show Me sets the bar: those value changes are the story's, not the reader's. */
  let applyingStory = false;
  let storyToast: string[] = [];
  let storyToastTimer: ReturnType<typeof setTimeout> | null = null;
  /** The answer glows for a few seconds after a story is applied, then fades. */
  let flashAnswer = false;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

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
        // Every tile asks for its data the moment it is on the page, so it is given the values the
        // filter bar opens with before it is: the same `openingValues` the bar fills its form with.
        // Given none, each tile first asked unfiltered - a wrong answer for a moment, and an error
        // from a query that needs its value - and asked again once the bar had loaded. A page with no
        // bar gives none: its parameters are its cards' own questions (Cube Stories, `hasFilterBar`).
        if (Array.isArray(config.parameters) && config.parameters.length > 0
            && hasFilterBar(config.dashboardTemplate))
          currentDashboardParams = openingValues(config.parameters, config.lockedParameters,
            typeof window !== 'undefined' ? window.location : null, reportId);
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
      decorateTiles(dashboardContainer);
      wireDrillThrough(dashboardContainer);
      wireNoData(dashboardContainer);
      startAutoRefresh();
      watchForNewTiles();
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
    // Every slicer of the dashboard, heard on itself (the event does not bubble), and shown whatever
    // the reader had already picked - an injection that runs again must not look like a slicer that
    // forgot.
    listenToSlicers();
    listenToCrossFilterTiles();
    if (slicerSelectionsFor(reportId).size > 0) applySelections();
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
    // One open panel at a time in a group of one name: the browser's own rule, stated here too so a
    // dashboard shows it whatever drew the page (Gallery areas, Cube Stories industries).
    if (dashboardContainer)
      closeOthersOfGroup(panel as HTMLDetailsElement,
        dashboardContainer.querySelectorAll<HTMLDetailsElement>('details[name]'));
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
   * Show Me asks first: "Apply the filter values and refresh the dashboard?". The filters the story
   * is about breathe in the bar, each with what it would set, while the question is open - the reader
   * sees what Yes does before saying it.
   */
  async function askToApply(story: any) {
    const params = ownParameters();
    confirmStoryId = String(story?.id ?? '');
    if (params && typeof params.describeStory === 'function' && typeof params.markInvolved === 'function') {
      const what = params.describeStory(story?.params || {});
      pendingChanges = what.changes;
      params.markInvolved('pending', what.involved, what.changes);
    }
    await tick();
    storyButton('btnShowMeYes', story)?.focus({ preventScroll: true });
  }

  function cancelStory(story: any) {
    confirmStoryId = '';
    pendingChanges = [];
    // The marks of the story that is on screen come back, and the keyboard goes back to the button that asked.
    const params = ownParameters();
    if (params && typeof params.markInvolved === 'function') {
      if (appliedMarks) params.markInvolved('applied', appliedMarks.involved, appliedMarks.changes);
      else params.markInvolved('');
    }
    storyButton('btnShowMe', story)?.focus({ preventScroll: true });
  }

  function onGateKey(event: KeyboardEvent, story: any) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancelStory(story);
    }
  }

  function storyButton(prefix: string, story: any): HTMLElement | null {
    return (container?.querySelector(`[id="${prefix}-${reportId}-${story?.id}"]`) as HTMLElement | null) ?? null;
  }

  function say(...lines: string[]) {
    storyToast = lines.filter(Boolean);
    if (storyToastTimer) clearTimeout(storyToastTimer);
    storyToastTimer = setTimeout(() => { storyToast = []; storyToastTimer = null; }, 7000);
  }

  /**
   * Yes: the story's values, set as if the reader had picked them, and this dashboard reloaded.
   *
   * `setValues` is where the validation lives (`shared/url-start-values.ts`, shared with the values
   * a page URL carries): an unknown name or a value outside a filter's options is ignored with one
   * warning, and a locked parameter keeps the link's value. The page does not navigate.
   */
  async function applyStory(story: any) {
    confirmStoryId = '';
    pendingChanges = [];
    const params = ownParameters();
    if (!params || typeof params.setValues !== 'function') {
      console.warn('[RbReport] Show Me: this dashboard has no filter bar to set');
      return;
    }
    const what = typeof params.describeStory === 'function'
      ? params.describeStory(story?.params || {}) : { involved: [], changes: [] };
    lastAskedId = story?.id ?? null;
    applyingStory = true;
    // From the dashboard as it opens, not from what the story before this one left in the bar.
    try {
      if (typeof params.showStory === 'function') params.showStory(story?.params || {});
      else params.setValues(story?.params || {});
    } finally {
      applyingStory = false;
    }
    appliedMarks = { involved: what.involved, changes: what.changes };
    if (typeof params.markInvolved === 'function') params.markInvolved('applied', what.involved, what.changes);
    params.reloadNow();

    say(...storyToastLines(story?.question, what.changes));
    // The reader pressed Yes to see the answer: the bar and the dashboard under it come into view,
    // and once the tiles have asked again the answer lights up for a moment.
    await tick();
    bringAnswerIntoView(params);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await flash();
  }

  /** The filter bar at the top of the screen, which is where the answer starts. */
  function bringAnswerIntoView(params: any) {
    if (typeof window === 'undefined' || !params?.scrollIntoView) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    params.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }

  /** Light the answer once: off and on again, so a second story lights it afresh. */
  async function flash() {
    if (flashTimer) clearTimeout(flashTimer);
    flashAnswer = false;
    await tick();
    flashAnswer = true;
    flashTimer = setTimeout(() => { flashAnswer = false; flashTimer = null; }, 3800);
  }

  /** Reset: this dashboard's own defaults, and the same reload. */
  function resetStories() {
    const params = ownParameters();
    if (!params || typeof params.reset !== 'function') {
      console.warn('[RbReport] Reset: this dashboard has no filter bar to reset');
      return;
    }
    lastAskedId = null;
    confirmStoryId = '';
    appliedMarks = null;
    if (typeof params.markInvolved === 'function') params.markInvolved('');
    params.reset();
    params.reloadNow();
    say('Filters back to their defaults');
  }

  /**
   * An arbitrary value as characters an HTML id may hold, the way `RbParameters.safeId` and
   * `RbSlicer.safeId` do it, so a test reaches one chip by its own id.
   */
  function safeId(value: unknown): string {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ── The slicers of this dashboard ──────────────────────────────────────
  //
  // A slicer applies by itself: the reader clicks a value and every tile built on that table answers for
  // that value. The canvas does the same thing with the same SQL (`slicer-filters.ts` wrote the
  // condition into each widget's query, bound to `__slicer_<field>`), so a dashboard answers the same
  // question whichever side of publishing it is read on.
  //
  // The event comes from the slicer element itself, not from the container: a web component's event
  // is handed to the listeners of its own host element and does not travel further up.

  /** What the reader has picked, for the chips bar. */
  let slicerChips: SlicerSelection[] = [];

  function slicersOf(): Element[] {
    return dashboardContainer ? Array.from(dashboardContainer.querySelectorAll(SLICER_TAG)) : [];
  }

  /** Hear every slicer of the dashboard, once each (injection may run again). */
  function listenToSlicers() {
    for (const slicer of slicersOf()) {
      slicer.removeEventListener('slicerSelect', handleSlicerSelect as EventListener);
      slicer.addEventListener('slicerSelect', handleSlicerSelect as EventListener);
    }
  }

  /**
   * Hear every tile whose own clicks make a selection: a chart bar, a table cell, a map region.
   *
   * Every data tile is listened to, not only the ones the author ticked: a tile that was not
   * ticked fires nothing at all (`clicksFilter` in its own config decides that), so there is
   * nothing to ask it about here. It has to be done again after every refresh, because a refresh
   * replaces each tile with a copy of itself (`refreshDataWidgets`) and a copy carries no
   * listeners - the same reason the slicers are never replaced.
   */
  /**
   * The tiles are replaced by copies of themselves - by Apply in the filter bar, by a tile's Refresh,
   * by a selection - and a copy carries no listeners, so a chart that filtered by its clicks stopped
   * doing it after the first Apply. Each data widget is listened to as it arrives instead.
   */
  let tileObserver: MutationObserver | null = null;
  function watchForNewTiles() {
    if (tileObserver || !dashboardContainer || typeof MutationObserver === 'undefined') return;
    tileObserver = new MutationObserver((changes) => {
      const arrived = changes.some((change) => Array.from(change.addedNodes).some((node) =>
        node instanceof Element && (node.matches(DATA_WIDGET_TAGS) || !!node.querySelector(DATA_WIDGET_TAGS))));
      if (arrived) listenToCrossFilterTiles();
    });
    tileObserver.observe(dashboardContainer, { childList: true, subtree: true });
  }

  /**
   * Each tile is listened to once. A remove-then-add does not make that safe: a widget not yet
   * mounted keeps every listener it was given and hands each one to its component when it mounts,
   * and a removal before that changes nothing - a copy wired by the selection that made it and
   * again by `watchForNewTiles` heard a click twice, and a second click on a bar selected it again
   * instead of taking it back.
   */
  const crossFilterTiles = new WeakSet<Element>();
  function listenToCrossFilterTiles() {
    if (!dashboardContainer) return;
    dashboardContainer.querySelectorAll(DATA_WIDGET_TAGS).forEach((tile: Element) => {
      if (crossFilterTiles.has(tile)) return;
      crossFilterTiles.add(tile);
      tile.addEventListener(CROSS_FILTER_EVENT, handleCrossFilterSelect as EventListener);
    });
  }

  /**
   * A click on a tile makes exactly the selection a slicer pick makes: same set, same chips, same
   * parameters, so the dashboard answers a click and a pick the same way. A second click on the
   * same value drops it again, and two values of one field OR together, as two slicer picks do.
   */
  function handleCrossFilterSelect(e: Event) {
    const detail = (e as CustomEvent).detail as { field?: string; value?: string } | undefined;
    if (!detail?.field || !detail.value) return;
    slicerSelectionsFor(reportId).toggle(detail.field, detail.value, true);
    applySelections();
  }

  function handleSlicerSelect(e: Event) {
    const detail = (e as CustomEvent).detail as
      { field?: string; value?: string; multiSelect?: boolean } | undefined;
    if (!detail?.field || detail.value === undefined) return;
    slicerSelectionsFor(reportId).toggle(detail.field, detail.value, detail.multiSelect !== false);
    applySelections();
  }

  /** One pick dropped, from its chip. */
  function removeSlicerSelection(field: string, value: string) {
    slicerSelectionsFor(reportId).remove(field, value);
    applySelections();
  }

  /** Every pick dropped at once: the dashboard answers for everything again. */
  function clearSlicerSelections() {
    slicerSelectionsFor(reportId).clear();
    applySelections();
  }

  /**
   * What a pick changes: the slicers show it, the chips bar says it, and every tile asks again with
   * the slicers' values beside the filter bar's.
   *
   * The slicers themselves are never replaced - a replaced element loses the listener this page put
   * on it and everything it had picked - so they are handed the new parameters instead and read
   * their own list again (`RbSlicer` watches `reportParams`). That read is what greys out the
   * values the other slicers' picks have left without rows; a slicer's own pick never narrows its own
   * list, so a reader can always pick twice.
   */
  function applySelections() {
    const selections = slicerSelectionsFor(reportId);
    slicerChips = selections.list();
    // Every slicer's field, always, so a field with nothing picked still sends the empty value
    // that turns its condition off - plus every field something IS picked in, which is how a
    // cross-filter click reaches the tiles: its field has no slicer on the page to be found by,
    // and a tile whose SQL mentions a parameter the request says nothing about reads it as
    // nothing picked (the script's own `has<P> && listHasValues` guard), which is every row.
    const picked = selections.fields();
    const fields = [...slicerFieldsOnPage(dashboardContainer)];
    for (const field of picked) if (!fields.includes(field)) fields.push(field);
    const values = {
      ...currentDashboardParams,
      ...selections.paramValues(fields),
    };
    for (const slicer of slicersOf()) {
      const el = slicer as unknown as { selectedValues?: string[]; reportParams?: Record<string, any> };
      el.selectedValues = selections.valuesOf(fieldOf(slicer));
      el.reportParams = values;
    }
    refreshDataWidgets(dashboardContainer, values);
    // The tiles were just replaced by copies of themselves, which carry no listeners.
    listenToCrossFilterTiles();
  }

  /**
   * A dashboard its author set to refresh asks all its data again every so many minutes (#22): the
   * same refresh a filter change makes, with the filter values and selections it has now.
   */
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    const minutes = autoRefreshMinutesOf(dashboardContainer);
    if (minutes > 0) autoRefreshTimer = setInterval(applySelections, minutes * 60_000);
  }

  function handleDashboardParamChange(e: CustomEvent) {
    // The tiles were put on the page with the values the bar opens with (loadConfig), and the bar
    // hands every later change to them itself; this keeps the values for a re-injection.
    currentDashboardParams = e.detail || {};
    // A filter the reader changes by hand is no longer what the story set: its marks go.
    if (!applyingStory && appliedMarks && !e.detail?.rbInit) {
      appliedMarks = null;
      const params = ownParameters();
      if (params && typeof params.markInvolved === 'function' && !confirmStoryId) params.markInvolved('');
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
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    tileObserver?.disconnect();
    tileObserver = null;
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

<!-- A page can hold several dashboards (the Gallery has one per card), so this one's ids carry
     its report id: dashboard-<reportId>, widgetLoading-/widgetError-/widgetReport-<reportId>. -->
<div bind:this={container} class="rb-report" id={reportId ? `dashboard-${reportId}` : undefined}>
  {#if loading}
    <div class="rb-report-loading" id={reportId ? `widgetLoading-${reportId}` : 'widgetLoading'}>
      <div class="rb-report-spinner"></div>
      <span>Loading...</span>
    </div>
  {/if}
  
  {#if error}
    <div class="rb-report-error" id={reportId ? `widgetError-${reportId}` : 'widgetError'}>
      <strong>Error:</strong> {error}
    </div>
  {/if}
  
  <!-- The questions this dashboard was written to answer, above its filter bar: a cube's hints,
       for a dashboard. Plain text, never `{@html}` - a stories file writes no markup. -->
  {#if configLoaded && dashboardTemplate && !error && offersStories}
    <div id="stories-{reportId}" class="rb-hints">
      {#each stories as story (story.id)}
        <div id="story-{reportId}-{story.id}" class="rb-hint" class:rb-hint-asked={story.id === lastAskedId}
             class:rb-hint-applied={story.id === lastAskedId} class:rb-hint-pending={String(story.id) === confirmStoryId}>
          {#if story.id === lastAskedId}
            <span class="rb-hint-stamp" id="storyApplied-{reportId}-{story.id}" title="This story is applied: its filters are set">applied</span>
          {/if}
          <div class="rb-hint-question">{story.question}</div>
          <div class="rb-hint-text">{story.text}</div>
          <div class="rb-hint-actions">
            <button type="button" id="btnShowMe-{reportId}-{story.id}" class="rb-hint-showme"
                    aria-expanded={String(story.id) === confirmStoryId}
                    title="Set the filters this question asks for" on:click={() => askToApply(story)}>Show Me</button>
            {#if String(story.id) === confirmStoryId}
              <span class="rb-hint-gate" id="storyGate-{reportId}-{story.id}" role="group"
                    aria-label="Apply the filter values and refresh the dashboard?" on:keydown={(e) => onGateKey(e, story)}>
                <span class="rb-hint-gate-question">Apply the filter values and refresh the dashboard?</span>
                <button type="button" id="btnShowMeYes-{reportId}-{story.id}" class="rb-gate-button rb-gate-yes"
                        on:click={() => applyStory(story)}>Yes</button>
                <button type="button" id="btnShowMeNo-{reportId}-{story.id}" class="rb-gate-button"
                        on:click={() => cancelStory(story)}>No</button>
              </span>
            {/if}
          </div>
          {#if String(story.id) === confirmStoryId}
            <!-- What Yes sets, said plainly: each filter and the value it takes. -->
            <div class="rb-hint-sets" id="storySets-{reportId}-{story.id}">
              {#if pendingChanges.length}
                <span class="rb-hint-sets-label">This sets</span>
                {#each pendingChanges as change (change.id)}
                  <span class="rb-hint-set"><span class="rb-hint-set-name">{change.label}</span> <strong>{change.toFull}</strong></span>
                {/each}
              {:else}
                <span class="rb-hint-sets-label">The filters are already set this way; Yes just refreshes the dashboard.</span>
              {/if}
            </div>
          {/if}
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
  {#if configLoaded && dashboardTemplate && !error && slicerChips.length > 0}
    <!-- What the reader has picked - in a slicer, or by clicking a tile that filters - and the one
         way to drop it all: the same bar the canvas shows above the same dashboard, with the same
         ids. -->
    <div class="rb-selections" id="selectionBar">
      <span class="rb-selections-label">Selections</span>
      {#each slicerChips as chip (chip.field + '=' + chip.value)}
        <span class="rb-selection-chip">
          <span class="rb-selection-field">{chip.field}:</span> {chip.value}
          <button
            type="button"
            id="btnRemoveSelection-{safeId(chip.field)}-{safeId(chip.value)}"
            class="rb-selection-drop"
            title="Drop this selection"
            on:click={() => removeSlicerSelection(chip.field, chip.value)}>x</button>
        </span>
      {/each}
      <button type="button" id="btnClearSelections" class="rb-selections-clear"
              on:click={clearSlicerSelections}>Clear all</button>
    </div>
  {/if}

  {#if configLoaded && dashboardTemplate && !error}
    <div class="rb-report-dashboard" id={reportId ? `widgetReport-${reportId}` : 'widgetReport'} bind:this={dashboardContainer}
         class:rb-result-flash={flashAnswer}></div>
  {/if}

  {#if storyToast.length}
    <div class="rb-toast" id="storyToast-{reportId}" role="status" aria-live="polite" title="Click to close"
         on:click={() => { storyToast = []; }}>
      {#each storyToast as line, i}<div class={i === 0 ? 'rb-toast-first' : 'rb-toast-rest'}>{line}</div>{/each}
    </div>
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
    gap: 10px;
    margin: 8px 0;
  }

  /* The selections bar: the slicers' picks, in the dashboard's own colours. */
  .rb-selections {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    margin-bottom: 8px;
    border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
    border-radius: 6px;
    background: color-mix(in oklab, currentColor 4%, transparent);
    font-size: 12px;
  }

  .rb-selections-label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    opacity: 0.6;
  }

  .rb-selection-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 8%, transparent);
  }

  .rb-selection-field {
    font-weight: 600;
  }

  .rb-selection-drop,
  .rb-selections-clear {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0 2px;
  }

  .rb-selections-clear {
    margin-left: auto;
    opacity: 0.7;
    font-size: 10px;
  }

  .rb-selections-clear:hover,
  .rb-selection-drop:hover {
    opacity: 1;
    text-decoration: underline;
  }

  /*
   * A story is the way in, so it has a look of its own - the cube's: a bar and a tint in the page's
   * accent. Every colour is that accent mixed into whatever the page already is, or the page's own text
   * colour, so it follows the theme (dark or light) and the words stay readable on any of them.
   */
  .rb-hint {
    --rb-story: var(--rb-accent, var(--color-primary, #2171b5));
    position: relative;
    border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
    border-left: 3px solid color-mix(in oklab, var(--rb-story) 70%, transparent);
    border-radius: 8px;
    padding: 10px 12px 10px 14px;
    background: color-mix(in oklab, var(--rb-story) 4%, transparent);
    transition: background 0.2s, border-color 0.2s;
  }
  .rb-hint:hover {
    border-color: color-mix(in oklab, var(--rb-story) 35%, transparent);
    border-left-color: var(--rb-story);
    background: color-mix(in oklab, var(--rb-story) 7%, transparent);
  }

  /* The story the reader asked last, marked while its values are the ones on screen. */
  .rb-hint-asked,
  .rb-hint-asked:hover {
    border-color: color-mix(in oklab, var(--rb-story) 70%, transparent);
    border-left-width: 5px;
    border-left-color: var(--rb-story);
    background: color-mix(in oklab, var(--rb-story) 13%, transparent);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--rb-story) 25%, transparent);
  }
  .rb-hint-applied .rb-hint-actions {
    padding-right: 84px;
    min-height: 30px;
  }
  /* The stamp: while the story is the one shown it says so in the corner. */
  .rb-hint-stamp {
    position: absolute;
    bottom: 14px;
    right: 14px;
    padding: 2px 10px;
    border: 2px solid #fff;
    border-radius: 3px;
    background: var(--rb-story);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    transform: rotate(-4deg);
    pointer-events: none;
    animation: rb-stamp-in 0.22s ease-out;
  }

  .rb-hint-question {
    font-size: 14px;
    font-weight: 600;
  }

  .rb-hint-text {
    font-size: 12px;
    color: color-mix(in oklab, currentColor 70%, transparent);
    margin: 2px 0 6px;
  }

  /* Show Me: a quiet pill, the accent as a thin outline and a faint tint; under the pointer or keyboard it fills. */
  .rb-hint-showme {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid color-mix(in oklab, var(--rb-story) 55%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--rb-story) 7%, transparent);
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 3px 13px 3px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .rb-hint-showme::before {
    content: '\25B6';
    font-size: 8px;
    color: color-mix(in oklab, var(--rb-story) 80%, currentColor);
    transition: color 0.15s;
  }
  .rb-hint-showme:hover,
  .rb-hint-showme:focus-visible {
    background: var(--rb-story);
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
  }
  .rb-hint-showme:hover::before,
  .rb-hint-showme:focus-visible::before {
    color: inherit;
  }
  .rb-hint-showme:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--rb-story) 70%, transparent);
    outline-offset: 2px;
  }
  /* The Reset is one for the whole dashboard, so it is a plain button, not a pill with a play mark. */
  .rb-hint-reset .rb-hint-showme::before {
    content: none;
  }
  .rb-hint-reset .rb-hint-showme {
    padding: 3px 13px;
  }

  .rb-hint-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 12px;
  }

  /* What Yes would set: "This sets  Year 2025  Region APAC", each filter a small chip, its value in bold. */
  .rb-hint-sets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin-top: 8px;
    font-size: 13px;
    animation: rb-gate-in 0.18s ease-out;
  }
  .rb-hint-sets-label {
    color: color-mix(in oklab, currentColor 70%, transparent);
  }
  .rb-hint-set {
    padding: 2px 11px;
    border: 1px solid color-mix(in oklab, var(--rb-story) 55%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--rb-story) 12%, transparent);
  }
  .rb-hint-set-name {
    color: color-mix(in oklab, currentColor 70%, transparent);
  }

  /* The Yes / No that opens beside Show Me: the same quiet pill, so it reads as the button's own question. */
  .rb-hint-gate {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    animation: rb-gate-in 0.18s ease-out;
  }
  .rb-hint-gate-question {
    font-size: 13px;
    font-weight: 600;
  }
  .rb-gate-button {
    border: 1px solid color-mix(in oklab, currentColor 28%, transparent);
    border-radius: 999px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    padding: 3px 13px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .rb-gate-button:hover,
  .rb-gate-button:focus-visible {
    background: color-mix(in oklab, currentColor 10%, transparent);
  }
  .rb-gate-yes {
    border-color: color-mix(in oklab, var(--rb-story) 65%, transparent);
    background: color-mix(in oklab, var(--rb-story) 12%, transparent);
    font-weight: 600;
  }
  .rb-gate-yes:hover,
  .rb-gate-yes:focus-visible {
    background: var(--rb-story);
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
  }
  .rb-gate-button:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--rb-story) 70%, transparent);
    outline-offset: 2px;
  }
  @keyframes rb-gate-in {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes rb-stamp-in {
    from { opacity: 0; transform: rotate(-4deg) scale(1.6); }
    to { opacity: 1; transform: rotate(-4deg) scale(1); }
  }

  /* The toast: said once, top right, in the accent with the text the theme pairs with it. */
  .rb-toast {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 100002;
    max-width: min(92vw, 460px);
    padding: 10px 18px;
    border-radius: 10px;
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    font-size: 14px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
    cursor: pointer;
    animation: rb-toast-in 0.25s ease-out;
  }
  .rb-toast-first {
    font-weight: 600;
  }
  .rb-toast-rest {
    font-size: 13px;
    margin-top: 3px;
    opacity: 0.92;
  }
  @keyframes rb-toast-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: none; }
  }

  /* The answer, lit for a moment after Yes: a ring and a soft tint in the accent that fade away on their own. */
  .rb-result-flash {
    position: relative;
    border-radius: 6px;
    animation: rb-result-ring 3.8s ease-out forwards;
  }
  @keyframes rb-result-ring {
    0%, 30% {
      box-shadow: 0 0 0 2px color-mix(in oklab, var(--rb-accent, var(--color-primary, #2171b5)) 85%, transparent),
        0 0 22px color-mix(in oklab, var(--rb-accent, var(--color-primary, #2171b5)) 45%, transparent);
    }
    100% {
      box-shadow: 0 0 0 2px transparent, 0 0 22px transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rb-toast, .rb-hint-gate, .rb-hint-stamp { animation: none; }
    .rb-result-flash { animation: none; outline: 2px solid color-mix(in oklab, var(--rb-accent, var(--color-primary, #2171b5)) 60%, transparent); }
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

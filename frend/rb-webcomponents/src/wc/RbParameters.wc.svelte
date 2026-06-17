<svelte:options customElement="rb-parameters" accessors={true} />

<script lang="ts">
  //console.log('[rb-parameters] ====== COMPONENT SCRIPT LOADED ======');
  
  import { onMount, createEventDispatcher, tick } from 'svelte';

  // ParamRef type for cross-field references
  interface ParamRef {
    name: string;
  }

  type MaybeRef<T> = T | ParamRef;

  // Parameter metadata interface
  export interface ParamMeta {
    id: string;
    type: string;
    defaultValue?: any;
    constraints?: { [k: string]: MaybeRef<any> };
    uiHints?: { [k: string]: any };
    label?: string;
    description?: string;
  }

  // ============================================================================
  // Hybrid Mode Props - when reportId is provided, component self-fetches
  // ============================================================================
  export let reportId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';

  // ============================================================================
  // Props Mode - traditional props-based usage (e.g., from Angular)
  // ============================================================================
  export let parameters: ParamMeta[] = [];
  
  // ============================================================================
  // Internal state for self-fetch mode
  // ============================================================================
  let loading = false;
  let error: string | null = null;
  
  // Raw DSL source code (exposed for Configuration tab)
  export let configDsl: string = '';

  // Show/hide the Reload button (hidden by default, shown via attribute show-reload="true")
  export let showReload: boolean = false;

  // Internal state
  let formValues: { [id: string]: any } = {};
  let touched: { [id: string]: boolean } = {};
  let errors: { [id: string]: string[] } = {};
  let isValid = true;
  let hostElement: HTMLElement | null = null;
  let container: HTMLDivElement;
  let isMounted = false;
  let pendingValidEmit: boolean | null = null;
  let pendingValuesEmit: { [id: string]: any } | null = null;

  // Per-multi-select-param transient state — kept here (not in formValues) so it
  // doesn't leak into valueChange events. Search resets pagination on input.
  let multiSearch: { [id: string]: string } = {};
  let multiPage: { [id: string]: number } = {};

  // Modal open-state and draft-value per multi-select param. The modal commits
  // to formValues only on OK; Cancel and backdrop-click discard the draft.
  // This isolates exploratory editing from valueChange events that re-fire
  // every widget on the canvas.
  let multiOpen: { [id: string]: boolean } = {};
  let multiDraft: { [id: string]: string } = {};

  // Default page size for multi-select — overridable via p.uiHints.pageSize.
  // 50 fits comfortably in a ~220px scrollable list and renders fast for the
  // realistic upper bound (~200 items). Larger lists need real pagination.
  const DEFAULT_MULTI_PAGE_SIZE = 50;

  const dispatch = createEventDispatcher();

  // Get host element reference on mount
  onMount(async () => {
    //console.log('[rb-parameters] onMount START, reportId:', reportId, 'apiBaseUrl:', apiBaseUrl);
    await tick();
    // Get the host element (the custom element itself)
    hostElement = container?.getRootNode() instanceof ShadowRoot 
      ? (container.getRootNode() as ShadowRoot).host as HTMLElement
      : container?.closest('rb-parameters');
    
    //console.log('[rb-parameters] onMount after tick, hostElement:', hostElement ? 'found' : 'null');
    
    // Read attributes directly from host element (Svelte props may not be populated yet for kebab-case attributes)
    if (hostElement) {
      if (!reportId) reportId = hostElement.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostElement.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostElement.getAttribute('api-key') || '';
      if (hostElement.hasAttribute('show-reload')) {
        const reloadAttr = hostElement.getAttribute('show-reload');
        showReload = reloadAttr === '' || reloadAttr === 'true';
      }
      //console.log('[rb-parameters] After reading host attributes - reportId:', reportId, 'apiBaseUrl:', apiBaseUrl);
    }
    
    isMounted = true;
    
    // Emit any pending events that were queued before mount
    if (pendingValidEmit !== null) {
      //console.log('[rb-parameters] onMount: emitting PENDING validChange:', pendingValidEmit);
      emitHostEvent('validChange', pendingValidEmit);
      pendingValidEmit = null;
    }
    if (pendingValuesEmit !== null) {
      //console.log('[rb-parameters] onMount: emitting PENDING valueChange');
      emitHostEvent('valueChange', pendingValuesEmit);
      pendingValuesEmit = null;
    }
    
    // ========================================================================
    // Hybrid Mode: if reportId provided, self-fetch config
    // ========================================================================
    if (reportId && apiBaseUrl) {
      //console.log('[rb-parameters] Self-fetch mode: fetching config for', reportId);
      loading = true;
      error = null;
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // TEMP: API key disabled for rollback
      // if (apiKey) headers['X-API-Key'] = apiKey;
      
      const configUrl = `${apiBaseUrl}/reports/${reportId}/config`;
      //console.log('[rb-parameters] Fetching config from:', configUrl);
      
      try {
        // Fetch config
        const configRes = await fetch(configUrl, { headers });
        //console.log('[rb-parameters] Config response status:', configRes.status);
        if (!configRes.ok) throw new Error(`Config fetch failed: ${configRes.status}`);
        const config = await configRes.json();
        
        //console.log('[rb-parameters] Config received:', {
        //  hasParameters: config.hasParameters,
        //  parametersCount: config.parameters?.length || 0,
        //  parametersDsl: config.parametersDsl ? `${config.parametersDsl.length} chars` : 'MISSING',
        //  parameters: config.parameters
        //});
        
        // Apply parameters from config
        if (config.parameters && Array.isArray(config.parameters)) {
          parameters = config.parameters;
          //console.log('[rb-parameters] Parameters applied:', parameters.length, 'params');
        } else {
          //console.warn('[rb-parameters] No parameters array in config!');
        }
        
        // Store raw DSL for Configuration tab display
        if (config.parametersDsl) {
          configDsl = config.parametersDsl;
          //console.log('[rb-parameters] configDsl set, length:', configDsl.length);
        } else {
          //console.warn('[rb-parameters] No parametersDsl in config!');
        }
        
        dispatch('configLoaded', { configDsl, config });
        
      } catch (err: any) {
        error = err.message || 'Failed to load parameters';
        //console.error('[rb-parameters] self-fetch error:', err);
        dispatch('fetchError', { message: error });
      }
      loading = false;
      //console.log('[rb-parameters] Self-fetch complete, loading:', loading, 'error:', error);
    } else {
      //console.log('[rb-parameters] Props mode (no self-fetch), parameters:', parameters?.length || 0);
    }
  });

  // Initialize form values from parameters
  $: if (parameters && parameters.length) {
    //console.log('[rb-parameters] reactive $: parameters changed, count:', parameters.length, 'isMounted:', isMounted);
    //console.log('[rb-parameters] parameters details:', JSON.stringify(parameters, null, 2));
    initForm();
  }

  function initForm() {
    //console.log('[rb-parameters] initForm START, params count:', parameters?.length);
    formValues = {};
    touched = {};
    errors = {};
    multiSearch = {};
    multiPage = {};
    multiOpen = {};
    multiDraft = {};

    parameters.forEach(p => {
      formValues[p.id] = p.defaultValue ?? getDefaultForType(p.type);
      touched[p.id] = false;
      errors[p.id] = [];
      // Seed transient multi-select state. Default-value seeding is automatic:
      // formValues already holds either '*' (→ "All" pre-checked) or a CSV
      // (→ matching boxes pre-checked) per the readback helpers.
      if (getControlType(p) === 'multi-select') {
        multiSearch[p.id] = '';
        multiPage[p.id] = 0;
      }
    });

    validateAll(true); // Force emit on init
    emitValues();
    // In standalone published dashboard mode, auto-apply defaults to sibling widgets
    // so the initial load reflects the default filter value without requiring a Reload click
    if (showReload && hostElement) {
      applyParamsToSiblings({ ...formValues });
    }
  }

  function getDefaultForType(type: string): any {
    const t = type.toLowerCase();
    if (t === 'boolean') return false;
    if (t === 'integer' || t === 'decimal') return null;
    return '';
  }

  // Sanitise an arbitrary option value into characters safe for an HTML id /
  // CSS selector. Used to compose stable per-checkbox IDs in the multi-select
  // (e.g. `strategy_runs_cb_42`) that Playwright getById can target reliably.
  function safeId(value: any): string {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // Convert a machine-readable parameter id into a human-readable display label
  // when the DSL author didn't provide an explicit `label:` field. Replaces
  // `_` and `-` with spaces and Title Cases each word: `strategy_runs` →
  // "Strategy Runs", `from-ts` → "From Ts". Internal helper — explicit `label:`
  // in the DSL always wins.
  function humanize(id: string): string {
    if (!id) return '';
    return id
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function paramLabel(p: ParamMeta): string {
    return p.label || humanize(p.id);
  }

  // Type checking for references
  function isRef(x: any): x is ParamRef {
    return x && typeof x === 'object' && 'name' in x;
  }

  // Get control type from parameter. Reads either `uiHints.control` (DSL-author
  // convention, kebab-case e.g. `multi-select`) OR `uiHints.widget` (the
  // FilterBarConfigPanel UI dropdown convention, no hyphens e.g. `multiselect`)
  // and normalises common aliases so both styles render the same control.
  function getControlType(p: ParamMeta): string {
    const raw = (p.uiHints?.control || p.uiHints?.widget || p.type || 'text').toLowerCase();
    if (raw === 'multiselect') return 'multi-select';
    if (raw === 'datepicker')  return 'date';
    return raw;
  }

  // Resolve min constraint (non-ref only for HTML attributes)
  function resolveMin(p: ParamMeta): string | null {
    const v = p.constraints?.min;
    if (!v || isRef(v)) return null;
    return String(v);
  }

  // Resolve max constraint (non-ref only for HTML attributes)
  function resolveMax(p: ParamMeta): string | null {
    const v = p.constraints?.max;
    if (!v || isRef(v)) return null;
    return String(v);
  }

  // Get actual value of a constraint (resolving refs)
  function getConstraintValue(p: ParamMeta, kind: 'min' | 'max'): any {
    const v = p.constraints?.[kind];
    if (isRef(v)) {
      return formValues[(v as ParamRef).name];
    }
    return v;
  }

  // Load select options. Three accepted shapes from p.uiHints?.options:
  //   1. ['Active', 'Inactive']            — plain strings; label === value
  //   2. [{label, value}, ...]             — explicit objects
  //   3. [['1','Run #1'], ['2','Run #2']]  — 2-element [value,label] tuples
  // Shape 3 is what the SQL-options resolver emits when the SELECT returns 2+
  // columns: backend ReportingService.resolveParameterSqlOptions (published
  // mode) and FilterBar.tsx (canvas mode) both produce it. Lets the user show
  // a friendly `name` while the IN-list bind receives the raw `id`.
  function loadOptions(p: ParamMeta): { label: string; value: any }[] {
    const opts = p.uiHints?.options;
    if (!opts) return [];
    if (Array.isArray(opts)) {
      return opts.map(o => {
        if (Array.isArray(o) && o.length >= 2 && typeof o[0] !== 'object') {
          return { value: o[0], label: String(o[1]) };
        }
        if (typeof o === 'object' && o !== null && 'label' in o && 'value' in o) {
          return o;
        }
        return { label: String(o), value: o };
      });
    }
    return [];
  }

  // ── Multi-select helpers ──────────────────────────────────────────────
  // Value contract: formValues[p.id] is either the literal '*' (wildcard,
  // backend rewrites the IN clause to 1=1) or a CSV of selected values
  // ('1,5,10'). Empty string means "no selection". This mirrors the existing
  // valueChange contract so __bindInList and convertToJdbiParameters consume
  // the value verbatim — no extra wiring needed downstream.
  //
  // The control renders as a TRIGGER BUTTON. Clicking opens a centered modal
  // with a draft copy of the value (`multiDraft[p.id]`). All edits in the
  // modal mutate the draft; only OK commits the draft to formValues and emits
  // valueChange. Cancel / Esc / backdrop-click discard the draft.

  const WILDCARD = '*';

  function multiPageSize(p: ParamMeta): number {
    const ps = (p.uiHints as any)?.pageSize;
    const n = typeof ps === 'number' ? ps : parseInt(String(ps), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MULTI_PAGE_SIZE;
  }

  function csvToSet(v: any): Set<string> {
    if (v == null || v === '' || v === WILDCARD) return new Set();
    return new Set(String(v).split(',').map(s => s.trim()).filter(Boolean));
  }

  // Read helpers. The template MUST pass `multiDraft[p.id]` / `formValues[p.id]`
  // explicitly so Svelte tracks the reactive dep. Functions that just close
  // over those maps internally are NOT seen as deps by the template's static
  // analysis — the checkbox state would silently desync from the data.
  function isDraftCheckedFor(value: any, draft: string | undefined): boolean {
    // While wildcard is the draft, render every checkbox as visually checked
    // so the user sees "All" represented as every-row-ticked. Clicking a row
    // explodes the wildcard into the full set, then toggles that one off.
    if (draft === WILDCARD) return true;
    if (!draft) return false;
    return csvToSet(draft).has(String(value));
  }

  function visibleOptions(p: ParamMeta): { label: string; value: any }[] {
    const all = loadOptions(p);
    const q = (multiSearch[p.id] || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(o => o.label.toLowerCase().includes(q));
  }

  function pagedVisibleOptions(p: ParamMeta): { label: string; value: any }[] {
    const visible = visibleOptions(p);
    const size = multiPageSize(p);
    const page = multiPage[p.id] ?? 0;
    const start = page * size;
    return visible.slice(start, start + size);
  }

  function pageCount(p: ParamMeta): number {
    const total = visibleOptions(p).length;
    const size = multiPageSize(p);
    return Math.max(1, Math.ceil(total / size));
  }

  function draftCountLabelFor(draft: string | undefined): string {
    if (draft === WILDCARD) return 'All';
    if (!draft) return '0 selected';
    return `${csvToSet(draft).size} selected`;
  }

  // Trigger-button summary derived from the COMMITTED value (formValues),
  // showing labels (not raw ids) so the user sees friendly text. Long lists
  // collapse to "N selected" to keep the button compact.
  function triggerLabelFor(p: ParamMeta, value: string | undefined): string {
    if (value === WILDCARD) return 'All';
    const set = csvToSet(value);
    if (set.size === 0) return 'None';
    const labelMap = new Map(loadOptions(p).map(o => [String(o.value), o.label]));
    const labels = Array.from(set).map(k => labelMap.get(k) ?? k);
    const joined = labels.join(', ');
    return joined.length <= 60 ? joined : `${set.size} selected`;
  }

  // ── Modal lifecycle ────────────────────────────────────────────────────
  function openMulti(p: ParamMeta) {
    multiDraft[p.id] = formValues[p.id] ?? '';
    multiSearch[p.id] = '';
    multiPage[p.id] = 0;
    multiOpen[p.id] = true;
    multiOpen = multiOpen;  // trigger Svelte reactivity
    multiDraft = multiDraft;
    multiSearch = multiSearch;
    multiPage = multiPage;
  }

  function okMulti(p: ParamMeta) {
    formValues[p.id] = multiDraft[p.id] ?? '';
    formValues = formValues;
    multiOpen[p.id] = false;
    multiOpen = multiOpen;
    touched[p.id] = true;
    validateAll();
    emitValues();
  }

  function cancelMulti(p: ParamMeta) {
    // Discard draft — no formValues mutation, no valueChange emit.
    multiOpen[p.id] = false;
    multiOpen = multiOpen;
  }

  // ── Draft mutators (operate on multiDraft, never touch formValues) ─────
  function setDraftCsv(p: ParamMeta, values: Set<string>) {
    multiDraft[p.id] = Array.from(values).join(',');
    multiDraft = multiDraft;
  }

  function selectAll(p: ParamMeta) {
    // Wildcard is the efficient representation — backend rewrites the IN
    // clause to 1=1 instead of binding every option as a separate param.
    multiDraft[p.id] = WILDCARD;
    multiDraft = multiDraft;
  }

  function selectNone(p: ParamMeta) {
    multiDraft[p.id] = '';
    multiDraft = multiDraft;
  }

  function handleDraftItem(p: ParamMeta, value: any, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const wasWildcard = multiDraft[p.id] === WILDCARD;
    // When wildcard is the draft, clicking a row means the user wants a
    // specific subset. Explode the wildcard into the full materialised set
    // first, then toggle the clicked row. Without this, unchecking would
    // start from an empty set instead of "all-but-this".
    const set = wasWildcard
      ? new Set(loadOptions(p).map(o => String(o.value)))
      : csvToSet(multiDraft[p.id]);
    const key = String(value);
    if (checked) set.add(key); else set.delete(key);
    setDraftCsv(p, set);
  }

  function prevPage(p: ParamMeta) {
    const cur = multiPage[p.id] ?? 0;
    multiPage[p.id] = Math.max(0, cur - 1);
    multiPage = multiPage;
  }

  function nextPage(p: ParamMeta) {
    const cur = multiPage[p.id] ?? 0;
    const max = pageCount(p) - 1;
    multiPage[p.id] = Math.min(max, cur + 1);
    multiPage = multiPage;
  }

  // Validate a single parameter
  function validateParam(p: ParamMeta): string[] {
    const errs: string[] = [];
    const value = formValues[p.id];
    const cons = p.constraints || {};

    // Required validation
    if (cons.required && (value === null || value === undefined || value === '')) {
      errs.push(`${paramLabel(p)} is required.`);
    }

    // Min validation
    if (cons.min != null) {
      const minVal = getConstraintValue(p, 'min');
      if (minVal != null && value != null && value !== '') {
        const type = p.type.toLowerCase();
        if (type.startsWith('localdate') || type === 'date' || type === 'datetime') {
          if (new Date(value) < new Date(minVal)) {
            errs.push(`Minimum: ${minVal}`);
          }
        } else {
          if (Number(value) < Number(minVal)) {
            errs.push(`Minimum: ${minVal}`);
          }
        }
      }
    }

    // Max validation
    if (cons.max != null) {
      const maxVal = getConstraintValue(p, 'max');
      if (maxVal != null && value != null && value !== '') {
        const type = p.type.toLowerCase();
        if (type.startsWith('localdate') || type === 'date' || type === 'datetime') {
          if (new Date(value) > new Date(maxVal)) {
            errs.push(`Maximum: ${maxVal}`);
          }
        } else {
          if (Number(value) > Number(maxVal)) {
            errs.push(`Maximum: ${maxVal}`);
          }
        }
      }
    }

    // Pattern validation
    if (cons.pattern && value) {
      const regex = new RegExp(cons.pattern);
      if (!regex.test(String(value))) {
        errs.push(`Pattern: ${cons.pattern}`);
      }
    }

    return errs;
  }

  // Validate all parameters
  function validateAll(forceEmit: boolean = false) {
    // console.log('[RbParameters] validateAll START, forceEmit:', forceEmit, 'isMounted:', isMounted);
    let allValid = true;
    parameters.forEach(p => {
      errors[p.id] = validateParam(p);
      if (errors[p.id].length > 0) {
        allValid = false;
      }
    });
    
    // console.log('[RbParameters] validateAll: allValid:', allValid, 'isValid:', isValid, 'will emit:', forceEmit || isValid !== allValid);
    
    if (forceEmit || isValid !== allValid) {
      isValid = allValid;
      dispatch('validChange', isValid);
      // Emit as CustomEvent for Angular/vanilla JS consumers
      emitHostEvent('validChange', isValid);
    }
  }

  // Handle input change
  function handleChange(p: ParamMeta, event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    let value: any;

    const controlType = getControlType(p);
    if (controlType === 'boolean') {
      value = (target as HTMLInputElement).checked;
    } else if (controlType === 'integer') {
      value = target.value ? parseInt(target.value, 10) : null;
    } else if (controlType === 'decimal') {
      value = target.value ? parseFloat(target.value) : null;
    } else {
      value = target.value;
    }

    formValues[p.id] = value;
    touched[p.id] = true;
    
    // Re-validate this param and any that reference it
    validateAll();
    emitValues();
  }

  // Handle blur for touched state
  function handleBlur(p: ParamMeta) {
    touched[p.id] = true;
  }

  // Emit current values
  function emitValues() {
    const values = { ...formValues };
    dispatch('valueChange', values);
    // Emit as CustomEvent for Angular/vanilla JS consumers
    emitHostEvent('valueChange', values);
  }

  // Replace all sibling rb-* components with fresh elements carrying the given params
  function applyParamsToSiblings(values: { [id: string]: any }) {
    if (!hostElement) return;
    const root = hostElement.closest('.rb-dashboard-root') || (hostElement.getRootNode() as Element | Document) || document;
    const paramsJson = JSON.stringify(values);
    const components = (root as Element | Document).querySelectorAll('rb-tabulator, rb-chart, rb-pivot-table, rb-value, rb-trend, rb-map, rb-sankey, rb-gauge, rb-progress, rb-detail');
    components.forEach((el: Element) => {
      const fresh = document.createElement(el.tagName.toLowerCase());
      for (const attr of Array.from(el.attributes)) {
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.setAttribute('report-params', paramsJson);
      el.parentNode?.replaceChild(fresh, el);
    });
  }

  // Submit: user explicitly requests data refresh with current param values
  let showConfirm = false;
  function handleReloadClick() {
    showConfirm = true;
  }
  function confirmReload() {
    showConfirm = false;
    const values = { ...formValues };
    emitHostEvent('submit', values);
    applyParamsToSiblings(values);
  }
  function cancelReload() {
    showConfirm = false;
  }

  // Dispatch custom event on the host element (for Angular, vanilla JS, etc.)
  function emitHostEvent(name: string, detail: any) {
    // console.log('[RbParameters] emitHostEvent called:', name, 'detail:', detail, 'isMounted:', isMounted, 'hostElement:', hostElement);
    
    // If not mounted yet, queue the event for later
    if (!isMounted) {
      // console.log('[RbParameters] emitHostEvent: NOT MOUNTED, queuing event:', name);
      if (name === 'validChange') {
        pendingValidEmit = detail;
      } else if (name === 'valueChange') {
        pendingValuesEmit = detail;
      }
      return;
    }
    
    if (!hostElement) {
      // Fallback: try to find host via container
      hostElement = container?.getRootNode() instanceof ShadowRoot 
        ? (container.getRootNode() as ShadowRoot).host as HTMLElement
        : container?.closest('rb-parameters');
      // console.log('[RbParameters] emitHostEvent: fallback hostElement lookup:', hostElement);
    }
    
    if (hostElement) {
      const event = new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true
      });
      // console.log('[RbParameters] emitHostEvent: DISPATCHING CustomEvent:', name, 'on host:', hostElement.tagName);
      hostElement.dispatchEvent(event);
    } else {
      console.warn('[RbParameters] emitHostEvent: NO HOST ELEMENT, event lost:', name);
    }
  }

  // Get current form values (for programmatic access)
  export function getValues(): { [id: string]: any } {
    return { ...formValues };
  }

  // Check if form is valid
  export function isFormValid(): boolean {
    return isValid;
  }

  // Reset form to defaults
  export function reset() {
    initForm();
  }

  // Public method to re-fetch config (for Refresh button)
  export async function fetchConfig() {
    if (!reportId || !apiBaseUrl) {
      console.warn('rb-parameters: fetchConfig requires reportId and apiBaseUrl');
      return;
    }
    
    loading = true;
    error = null;
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // TEMP: API key disabled for rollback
    // if (apiKey) headers['X-API-Key'] = apiKey;
    
    try {
      // Fetch config
      const configRes = await fetch(`${apiBaseUrl}/reports/${reportId}/config`, { headers });
      if (!configRes.ok) throw new Error(`Config fetch failed: ${configRes.status}`);
      const config = await configRes.json();
      
      // Apply parameters from config
      if (config.parameters && Array.isArray(config.parameters)) {
        parameters = config.parameters;
      }
      
      // Update raw DSL for Configuration tab
      if (config.parametersDsl) {
        configDsl = config.parametersDsl;
      }

      dispatch('configLoaded', { configDsl, config });
    } catch (err: any) {
      error = err.message || 'Failed to load parameters';
      console.error('rb-parameters fetchConfig error:', err);
      dispatch('fetchError', { message: error });
    }
    loading = false;
  }
</script>

{#if loading}
  <div class="rb-loading" id="widgetLoading">Loading parameters...</div>
{:else if error}
  <div class="rb-error" id="widgetError">{error}</div>
{:else}
  <div bind:this={container} id="formReportParameters" class="rb-parameters-form">
    {#if parameters && parameters.length}
      <!-- Debug: rendering {parameters.length} parameters -->
      <form class="report-parameters-form" style="display: flex; flex-direction: column; gap: 1rem;">
        {#each parameters as p (p.id)}
          <div class="form-group">
            <!-- Multi-select renders its own "Choose <label>" inside the trigger button,
                 so the form-group <label> above would be a redundant repetition. Hide it
                 for that control only. All other controls keep the standalone label. -->
            {#if getControlType(p) !== 'multi-select'}
              <label for={p.id}>{paramLabel(p)}</label>
            {/if}

            {#if getControlType(p) === 'date'}
              <input
                type="date"
                id={p.id}
                value={formValues[p.id] || ''}
                min={resolveMin(p)}
                max={resolveMax(p)}
                title={p.description || paramLabel(p)}
                class="form-control"
                on:input={(e) => handleChange(p, e)}
                on:blur={() => handleBlur(p)}
              />
            {:else if getControlType(p) === 'datetime'}
              <input
                type="datetime-local"
                id={p.id}
                value={formValues[p.id] || ''}
                min={resolveMin(p)}
                max={resolveMax(p)}
                title={p.description || ''}
                class="form-control"
                on:input={(e) => handleChange(p, e)}
                on:blur={() => handleBlur(p)}
            />
          {:else if getControlType(p) === 'integer'}
            <input
              type="number"
              id={p.id}
              value={formValues[p.id] ?? ''}
              step="1"
              min={resolveMin(p)}
              max={resolveMax(p)}
              title={p.description || ''}
              class="form-control"
              on:input={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            />
          {:else if getControlType(p) === 'decimal'}
            <input
              type="number"
              id={p.id}
              value={formValues[p.id] ?? ''}
              step="any"
              min={resolveMin(p)}
              max={resolveMax(p)}
              title={p.description || ''}
              class="form-control"
              on:input={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            />
          {:else if getControlType(p) === 'boolean'}
            <input
              type="checkbox"
              id={p.id}
              checked={formValues[p.id] || false}
              title={p.description || ''}
              on:change={(e) => handleChange(p, e)}
            />
          {:else if getControlType(p) === 'multi-select'}
            <!-- Playwright getById targets — every actionable element has a stable id:
                   <p.id>                  trigger button (also matches the form-group <label for>)
                   <p.id>_search           search input INSIDE the modal
                   <p.id>_btnAll           "All" → selects all (sends '*')
                   <p.id>_btnNone          "None" → clears all selections
                   <p.id>_lblCount         "N selected" / "All" indicator INSIDE the modal
                   <p.id>_cb_<value>       per-option checkbox (value sanitised via safeId)
                   <p.id>_btnPrevPage      pagination Prev (only when pageCount > 1)
                   <p.id>_lblPagePos       "Page X of Y" indicator
                   <p.id>_btnNextPage      pagination Next
                   <p.id>_btnOk            commit draft → formValues + close modal
                   <p.id>_btnCancel        discard draft + close modal
                   <p.id>_modalOverlay     backdrop (also closes modal — acts as Cancel) -->
            <button type="button" id={p.id} class="form-control rb-multi-trigger"
                    on:click={() => openMulti(p)}>
              <span>Choose {paramLabel(p)}</span>
              <span class="rb-multi-trigger-summary">{triggerLabelFor(p, formValues[p.id])}</span>
              <span class="rb-multi-trigger-caret">▾</span>
            </button>

            {#if multiOpen[p.id]}
              <div class="rb-multi-overlay" id={p.id + '_modalOverlay'}
                   on:click={() => cancelMulti(p)}
                   on:keydown={(e) => { if (e.key === 'Escape') cancelMulti(p); }}
                   role="presentation">
                <div class="rb-multi-modal" role="dialog" aria-modal="true"
                     on:click|stopPropagation
                     on:keydown|stopPropagation>
                  <div class="rb-multi-modal-title">Choose {paramLabel(p)}</div>

                  <input type="search" id={p.id + '_search'} class="form-control rb-multi-search"
                         placeholder="Search…"
                         bind:value={multiSearch[p.id]}
                         on:input={() => { multiPage[p.id] = 0; multiPage = multiPage; }} />

                  <div class="rb-multi-toolbar">
                    <button type="button" class="rb-multi-link"
                            id={p.id + '_btnAll'}
                            on:click={() => selectAll(p)}>All</button>
                    <button type="button" class="rb-multi-link"
                            id={p.id + '_btnNone'}
                            on:click={() => selectNone(p)}>None</button>
                    <span class="rb-multi-count" id={p.id + '_lblCount'}>{draftCountLabelFor(multiDraft[p.id])}</span>
                  </div>

                  <div class="rb-multi-list">
                    {#each pagedVisibleOptions(p) as o (o.value)}
                      <label class="rb-multi-row" for={p.id + '_cb_' + safeId(o.value)}>
                        <input type="checkbox"
                               id={p.id + '_cb_' + safeId(o.value)}
                               value={o.value}
                               checked={isDraftCheckedFor(o.value, multiDraft[p.id])}
                               on:change={(e) => handleDraftItem(p, o.value, e)} />
                        <span>{o.label}</span>
                      </label>
                    {/each}
                  </div>

                  {#if pageCount(p) > 1}
                    <div class="rb-multi-pager">
                      <button type="button"
                              id={p.id + '_btnPrevPage'}
                              disabled={(multiPage[p.id] ?? 0) === 0}
                              on:click={() => prevPage(p)}>‹ Prev</button>
                      <span id={p.id + '_lblPagePos'}>Page {(multiPage[p.id] ?? 0) + 1} of {pageCount(p)}</span>
                      <button type="button"
                              id={p.id + '_btnNextPage'}
                              disabled={(multiPage[p.id] ?? 0) === pageCount(p) - 1}
                              on:click={() => nextPage(p)}>Next ›</button>
                    </div>
                  {/if}

                  <div class="rb-multi-modal-buttons">
                    <button type="button" id={p.id + '_btnCancel'}
                            class="rb-multi-link"
                            on:click={() => cancelMulti(p)}>Cancel</button>
                    <button type="button" id={p.id + '_btnOk'}
                            class="rb-multi-ok"
                            on:click={() => okMulti(p)}>OK</button>
                  </div>
                </div>
              </div>
            {/if}
          {:else if getControlType(p) === 'select'}
            <select
              id={p.id}
              value={formValues[p.id]}
              title={p.description || ''}
              class="form-control"
              on:change={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            >
              {#each loadOptions(p) as o}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          {:else}
            <input
              type="text"
              id={p.id}
              value={formValues[p.id] || ''}
              title={p.description || ''}
              class="form-control"
              on:input={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            />
          {/if}

          {#if touched[p.id] && errors[p.id]?.length > 0}
            <div class="text-danger validation-errors">
              {#each errors[p.id] as err}
                <div>{err}</div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </form>
    {#if showReload}
      {#if !showConfirm}
        <button id="btnReloadDashboard" type="button" style="display:block;width:100%;margin-top:12px;padding:10px 20px;background:var(--rb-accent, var(--color-primary, #2171b5));color:var(--rb-accent-text, var(--color-primary-content, #fff));border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;" on:click={handleReloadClick}>
          Reload
        </button>
      {:else}
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 16px;background:var(--color-base-200, color-mix(in srgb, currentColor 6%, transparent));border:1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));border-radius:6px;">
          <span style="flex:1;font-size:13px;color:inherit;">Reload dashboard with current parameters?</span>
          <button id="btnConfirmReload" type="button" style="padding:6px 16px;background:var(--rb-accent, var(--color-primary, #2171b5));color:var(--rb-accent-text, var(--color-primary-content, #fff));border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;" on:click={confirmReload}>Yes</button>
          <button id="btnCancelReload" type="button" style="padding:6px 16px;background:color-mix(in srgb, currentColor 12%, transparent);color:inherit;border:1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;" on:click={cancelReload}>No</button>
        </div>
      {/if}
    {/if}
  {:else}
    <div class="rb-no-params" style="padding: 1rem; color: color-mix(in srgb, currentColor 60%, transparent); text-align: center;">
      No parameters defined. Check console for debug info.
    </div>
  {/if}
  </div>
{/if}

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
  
  .rb-parameters-form {
    font-family: inherit;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  label {
    font-weight: 500;
    margin-bottom: 0.25rem;
  }
  
  /* Native form inputs inherit the page: transparent background, currentColor
     text, structural border derived from currentColor. Focus ring uses the host
     accent. A host MAY override: rb-parameters { --rb-border / --rb-accent / --rb-surface }.
     No daisyUI / Tailwind hardcoded. */
  .form-control {
    padding: 0.5rem;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
    border-radius: 4px;
    font-size: 1rem;
    background: transparent;
    color: inherit;
  }

  .form-control:focus {
    outline: none;
    border-color: var(--rb-accent, var(--color-primary, #2171b5));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--rb-accent, var(--color-primary, #2171b5)) 25%, transparent);
  }
  
  .text-danger {
    color: #dc3545;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  
  input[type="checkbox"] {
    width: 1.25rem;
    height: 1.25rem;
  }

  .rb-submit-btn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 10px 20px;
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .rb-submit-btn:hover {
    opacity: 0.9;
  }

  /* Multi-select control — trigger button opens a centered modal with a
     searchable, paginated checkbox list. "All" / "None" buttons set or clear
     the draft selection; OK commits, Cancel discards. Theme-inheriting: trigger
     is transparent, the floating modal uses an opaque surface (--rb-surface,
     Canvas) so it stays readable over any content. No daisyUI / Tailwind. */
  .rb-multi-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    cursor: pointer;
    background: transparent;
    color: inherit;
  }
  .rb-multi-trigger-summary {
    flex: 1;
    color: color-mix(in srgb, currentColor 60%, transparent);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rb-multi-trigger-caret {
    color: color-mix(in srgb, currentColor 60%, transparent);
    font-size: 0.75rem;
  }
  .rb-multi-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rb-multi-modal {
    background: var(--rb-surface, Canvas);
    color: inherit;
    border-radius: 6px;
    padding: 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    max-width: 480px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rb-multi-modal-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .rb-multi-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
  }
  .rb-multi-ok {
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border: 1px solid var(--rb-accent, var(--color-primary, #2171b5));
    padding: 4px 16px;
    border-radius: 3px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .rb-multi-ok:hover {
    opacity: 0.9;
  }
  .rb-multi-search {
    width: 100%;
  }
  .rb-multi-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 0;
    border-bottom: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
  }
  .rb-multi-link {
    background: transparent;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
    color: color-mix(in srgb, currentColor 60%, transparent);
    padding: 2px 12px;
    border-radius: 3px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .rb-multi-link:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .rb-multi-count {
    margin-left: auto;
    font-size: 0.75rem;
    color: color-mix(in srgb, currentColor 60%, transparent);
    font-weight: 500;
  }
  .rb-multi-list {
    flex: 1;
    min-height: 200px;
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rb-multi-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    cursor: pointer;
    font-weight: normal;
    margin-bottom: 0;
  }
  .rb-multi-row:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .rb-multi-row input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
  }
  .rb-multi-pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 4px;
    border-top: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
    font-size: 0.8rem;
    color: color-mix(in srgb, currentColor 60%, transparent);
  }
  .rb-multi-pager button {
    background: transparent;
    border: 1px solid var(--rb-border, color-mix(in srgb, currentColor 22%, transparent));
    color: color-mix(in srgb, currentColor 60%, transparent);
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .rb-multi-pager button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rb-multi-pager button:not(:disabled):hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
</style>

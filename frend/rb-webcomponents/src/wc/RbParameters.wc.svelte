<svelte:options customElement="rb-parameters" accessors={true} />

<script lang="ts">
  //console.log('[rb-parameters] ====== COMPONENT SCRIPT LOADED ======');
  
  import { onMount, createEventDispatcher, tick } from 'svelte';
  // Which control each declared type is filled in with lives in its own module, so `npm test`
  // can ask it directly - see src/shared/parameter-controls.test.ts.
  import { controlTypeOf, isTicked } from '../shared/parameter-controls';
  import { slicerFieldsOnPage, slicerSelectionsFor, refreshDataWidgets } from '../shared/slicer-selections';
  import { withCsrfHeader } from '../shared/session-request';
  // A `date-range` control draws `<id>From` and `<id>To` as one range with presets - see
  // src/shared/date-range.ts.
  import {
    DATE_RANGE_PRESETS, presetOf, presetRange, rangePartnerIds, rangePartnerOf, rangeToday,
  } from '../shared/date-range';
  // Starting values a link carries, and the address bar kept on the view that is on screen. This
  // component is the only one that reads or writes the URL for parameters - see
  // src/shared/url-start-values.ts for the rules.
  import {
    urlWithValues, acceptedValues, splitEscaped, joinEscaped, openingValues,
  } from '../shared/url-start-values';

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
  let formId = 'formReportParameters';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';

  /**
   * Parameters the share link or embed token fixes: { name: value | [values] }.
   *
   * A locked parameter is shown with its locked value and disabled — not hidden. The viewer needs
   * to see WHAT they are looking at ("region = EU"); a control that quietly disappeared would make
   * a filtered dashboard look like the whole one. The real guard is the server, which overwrites
   * these values on every data request whatever the browser sends.
   */
  export let lockedParameters: { [id: string]: any } = {};

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

  /**
   * The day a date range's presets count from: the data's today on the dashboard's connection, as the
   * server's config hands it (`dataToday`) or the Canvas sets it. Empty = the browser's own date.
   */
  export let dataToday: string = '';

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
  // What is typed in a long single select's search box (#18), per parameter.
  let selectSearch: { [id: string]: string } = {};
  let multiPage: { [id: string]: number } = {};

  // A list too long to send whole is searched where it lives: `uiHints.remoteSearch` makes the
  // search box ask whoever supplies the options (a `searchChange` host event, 300 ms after the
  // typing stops) instead of filtering the list it was given, and `setOptions` puts the answer in
  // place - so the modal stays open, with the typed text and the boxes ticked so far.
  const REMOTE_SEARCH_DEBOUNCE_MS = 300;
  let searchTimers: { [id: string]: any } = {};
  /** Bumped by `setOptions`, so an open list redraws although `parameters` is the same array. */
  let optionsVersion = 0;

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
      // A filter bar the page places inside another control (a Share dialog's lock, a cube card) has
      // an id of its own, and its form is named after it, so the page's own filter bar stays the one
      // #formReportParameters: <host id>_formReportParameters.
      if (hostElement.id) formId = `${hostElement.id}_formReportParameters`;
      if (!reportId) reportId = hostElement.getAttribute('report-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostElement.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostElement.getAttribute('api-key') || '';
      if (!embedToken) embedToken = hostElement.getAttribute('embed-token') || '';
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
      if (embedToken) headers['X-Embed-Token'] = embedToken;
      
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
        
        // Locks first: they change how the parameters below are seeded and rendered, and
        // assigning them after would init the form once unlocked and once locked.
        if (config.lockedParameters && typeof config.lockedParameters === 'object') {
          lockedParameters = config.lockedParameters;
        }

        if (typeof config.dataToday === 'string') dataToday = config.dataToday;

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
  $: if (parameters && parameters.length && lockedParameters) {
    //console.log('[rb-parameters] reactive $: parameters changed, count:', parameters.length, 'isMounted:', isMounted);
    //console.log('[rb-parameters] parameters details:', JSON.stringify(parameters, null, 2));
    initForm();
  }

  // `fromUrl` is false only for Reset, which means "the defaults", not "what the link asked for".
  function initForm(fromUrl: boolean = true) {
    //console.log('[rb-parameters] initForm START, params count:', parameters?.length);
    formValues = {};
    touched = {};
    errors = {};
    multiSearch = {};
    multiPage = {};
    multiOpen = {};
    multiDraft = {};

    // Defaults and locks first: the cascading filters below were answered for those. The values come
    // from `openingValues`, the one place `RbReport` reads them from too (shared/url-start-values.ts).
    const defaults = openingValues(parameters as any, lockedParameters, null, reportId);
    parameters.forEach(p => {
      formValues[p.id] = defaults[p.id];
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

    // The options a filter's SELECT answered came with the parameters, asked for these defaults.
    optionsAskedFor = {};
    parameters.forEach(p => {
      if (optionsDependOn(p).length > 0) optionsAskedFor[p.id] = dependencyKey(p, formValues);
    });

    // Starting values the page URL carries: a link can hold a view. They are seeded HERE, before
    // the first emit, so the dashboard loads once - showing what the link asked for - instead of
    // once with the defaults and once again with the link's values. A locked parameter ignores
    // them: its value is the link's own, and the server enforces that whatever the browser sends.
    if (fromUrl && typeof window !== 'undefined' && window.location) {
      formValues = openingValues(parameters as any, lockedParameters, window.location, reportId);
    }

    validateAll(true); // Force emit on init
    emitValues(true);
    // In standalone published dashboard mode, auto-apply defaults to sibling widgets
    // so the initial load reflects the default filter value without requiring a Reload click.
    // A tile the dashboard already put on the page with these values is left alone: it is asking
    // with them right now, and a copy would only ask the same question twice.
    if (showReload && hostElement) {
      applyParamsToSiblings({ ...formValues }, true);
    }
  }

  /** Is this parameter fixed by the link or token the page was opened with? */
  function isLocked(p: ParamMeta): boolean {
    return !!lockedParameters && Object.prototype.hasOwnProperty.call(lockedParameters, p.id);
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

  // Get control type from parameter. The alias table lives in one place,
  // `src/shared/parameter-controls.ts`, which reads either `uiHints.control`
  // (DSL-author convention, kebab-case e.g. `multi-select`) OR `uiHints.widget`
  // (the FilterBarConfigPanel dropdown convention, no hyphens e.g.
  // `multiselect`, `datepicker`, `checkbox`), so both styles draw the same
  // control and a control this file cannot draw says so in the console.
  function getControlType(p: ParamMeta): string {
    return controlTypeOf(p as any);
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
    // A parameter that names its values in constraints(allowedValues: [...]) and gives its control
    // no options of its own is offered exactly those values: they are the only ones it accepts.
    const opts = p.uiHints?.options ?? p.constraints?.allowedValues;
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

  /** Does this parameter's search box ask the host instead of filtering the list it was given? */
  function isRemoteSearch(p: ParamMeta): boolean {
    return !!(p.uiHints as any)?.remoteSearch;
  }

  /**
   * One parameter's options, replaced in place: what the host answers a `searchChange` with.
   *
   * `parameters` deliberately keeps its identity - a new array re-runs `initForm`, and the modal the
   * person is typing in would close and forget what they had ticked. `optionsVersion` is what tells
   * the open list to redraw.
   */
  export function setOptions(id: string, options: any[]) {
    const p = (parameters || []).find(x => x.id === id);
    if (!p) return;
    p.uiHints = { ...(p.uiHints || {}), options };
    optionsVersion += 1;
  }

  /** A single select longer than this gets a search box above it (#18). */
  const SELECT_SEARCH_FROM = 10;

  /**
   * The options a single select or a radio group draws, as `optionsVersion` last left them: a list
   * asked again (a cascading filter, #17) is replaced in place, and only the version says it changed.
   * Narrowed by what is typed in a long select's search box (#18); the option the filter holds stays
   * in the list, so the select never shows a value it does not hold.
   */
  function shownOptions(p: ParamMeta, search: string | undefined, _version: number): { label: string; value: any }[] {
    const all = loadOptions(p);
    const wanted = (search || '').trim().toLowerCase();
    if (!wanted) return all;
    const held = String(formValues[p.id] ?? '');
    return all.filter(o => String(o.label).toLowerCase().includes(wanted) || String(o.value) === held);
  }

  /** The search box was typed in: page 1 again, and for a remote list, ask the host. */
  function onMultiSearchInput(p: ParamMeta) {
    multiPage[p.id] = 0;
    multiPage = multiPage;
    if (!isRemoteSearch(p)) return;
    clearTimeout(searchTimers[p.id]);
    searchTimers[p.id] = setTimeout(() => {
      emitHostEvent('searchChange', { id: p.id, search: multiSearch[p.id] || '' });
    }, REMOTE_SEARCH_DEBOUNCE_MS);
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

  // A multi-select's value is its picked options joined by commas, a comma inside one option
  // written `\,` (`splitEscaped` / `joinEscaped`): an option holding a comma stays one option.
  function csvToSet(v: any): Set<string> {
    if (v == null || v === '' || v === WILDCARD) return new Set();
    return new Set(splitEscaped(String(v)));
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
    // A remote list is already the answer to what was typed, and a label need not contain the text
    // at all (the host may have matched on the value): filtering it again here would hide values.
    if (isRemoteSearch(p)) return all;
    const q = (multiSearch[p.id] || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(o => o.label.toLowerCase().includes(q));
  }

  // `_search`, `_page` and `_version` are the reactive deps this reads through `multiSearch`,
  // `multiPage` and the options: the template passes them so Svelte redraws the list when they
  // change, exactly as the note above `isDraftCheckedFor` says it must.
  function pagedVisibleOptions(
    p: ParamMeta, _search?: string, _page?: number, _version?: number,
  ): { label: string; value: any }[] {
    const visible = visibleOptions(p);
    const size = multiPageSize(p);
    const page = multiPage[p.id] ?? 0;
    const start = page * size;
    return visible.slice(start, start + size);
  }

  function pageCount(p: ParamMeta, _search?: string, _version?: number): number {
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
    syncUrl();
  }

  function cancelMulti(p: ParamMeta) {
    // Discard draft — no formValues mutation, no valueChange emit.
    multiOpen[p.id] = false;
    multiOpen = multiOpen;
  }

  // ── Draft mutators (operate on multiDraft, never touch formValues) ─────
  function setDraftCsv(p: ParamMeta, values: Set<string>) {
    multiDraft[p.id] = joinEscaped(Array.from(values));
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
    syncUrl();
  }

  // The `<id>To` of every range is drawn inside its range, not again on its own.
  $: rangeToIds = rangePartnerIds(parameters);

  /** A preset fills both days of a range at once, counted from the data's today (`date-range.ts`). */
  function pickPreset(from: ParamMeta, to: ParamMeta, event: Event) {
    const range = presetRange((event.target as HTMLSelectElement).value, rangeToday(dataToday));
    if (!range) return;
    formValues[from.id] = range.from;
    formValues[to.id] = range.to;
    touched[from.id] = true;
    touched[to.id] = true;
    validateAll();
    emitValues();
    syncUrl();
  }

  // Handle blur for touched state
  function handleBlur(p: ParamMeta) {
    touched[p.id] = true;
  }

  // Emit current values. `fromInit` says this is the component seeding itself from the declared
  // defaults, not a person changing a filter: the two mean opposite things when a value is empty,
  // and only the page that hosts the controls can tell them apart. The flag rides along on the
  // detail without being part of it - non-enumerable, so Object.entries, JSON.stringify and every
  // consumer that reads the values see exactly what they saw before.
  function emitValues(fromInit = false) {
    const values = { ...formValues };
    Object.defineProperty(values, 'rbInit', { value: fromInit, enumerable: false });
    dispatch('valueChange', values);
    // Emit as CustomEvent for Angular/vanilla JS consumers
    emitHostEvent('valueChange', values);
    refreshDependentOptions();
  }

  // ── Cascading filters (#17) ───────────────────────────────────────────────
  // A filter whose options SELECT names other filters (`WHERE country = ${country}`) says which in
  // `uiHints.optionsDependOn` (the server's config, or the Canvas, reads that off the SQL). When one
  // of them changes, its options are asked again for the values the form holds: from the server on a
  // published dashboard, from the host otherwise - an `optionsChange` event the Canvas answers with
  // `setDependentOptions`.

  /** The values each dependent filter's options were last asked for: an unchanged one is not asked again. */
  let optionsAskedFor: { [id: string]: string } = {};

  function optionsDependOn(p: ParamMeta): string[] {
    const deps = (p.uiHints as any)?.optionsDependOn;
    return Array.isArray(deps) ? deps.map(String) : [];
  }

  function dependencyKey(p: ParamMeta, values: { [id: string]: any }): string {
    return JSON.stringify(optionsDependOn(p).map(id => values[id] ?? ''));
  }

  /** The filters a dependent filter's options follow, by their labels, for the note under it. */
  function dependsOnLabels(p: ParamMeta): string {
    return optionsDependOn(p)
      .map(id => { const q = (parameters || []).find(x => x.id === id); return q ? paramLabel(q) : id; })
      .join(', ');
  }

  function refreshDependentOptions() {
    for (const p of parameters || []) {
      if (optionsDependOn(p).length === 0) continue;
      const key = dependencyKey(p, formValues);
      if (optionsAskedFor[p.id] === key) continue;
      optionsAskedFor[p.id] = key;
      askOptions(p, key);
    }
  }

  async function askOptions(p: ParamMeta, key: string) {
    const values = { ...formValues };
    if (!(reportId && apiBaseUrl)) {
      emitHostEvent('optionsChange', { id: p.id, values });
      return;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (embedToken) headers['X-Embed-Token'] = embedToken;
      const response = await fetch(`${apiBaseUrl}/reports/${encodeURIComponent(reportId)}/parameter-options`, {
        method: 'POST',
        headers: withCsrfHeader(headers),
        body: JSON.stringify({ param: p.id, params: values }),
      });
      if (!response.ok) throw new Error(`parameter-options answered ${response.status}`);
      const answer = await response.json();
      // Asked again meanwhile: only the newest answer is shown.
      if (optionsAskedFor[p.id] !== key) return;
      setDependentOptions(p.id, Array.isArray(answer?.options) ? answer.options : []);
    } catch (err) {
      console.warn(`rb-parameters: the options of "${p.id}" could not be asked again`, err);
    }
  }

  /**
   * A dependent filter's new options, and its value kept only where they still offer it: a city of
   * the country no longer picked is no answer. What a host answers an `optionsChange` with.
   */
  export function setDependentOptions(id: string, options: any[]) {
    const p = (parameters || []).find(x => x.id === id);
    if (!p) return;
    setOptions(id, options);
    const offered = new Set(loadOptions(p).map(o => String(o.value)));
    const control = getControlType(p);
    const current = formValues[id];
    let next = current;
    if ((control === 'select' || control === 'radio') && current != null && current !== ''
        && !offered.has(String(current))) {
      next = '';
    } else if (control === 'multi-select' && typeof current === 'string' && current !== '' && current !== '*') {
      const picked = splitEscaped(current);
      const kept = picked.filter(v => offered.has(v));
      if (kept.length !== picked.length) next = joinEscaped(kept);
    }
    if (next === current) return;
    formValues[id] = next;
    formValues = formValues;
    validateAll();
    emitValues();
    syncUrl();
  }

  /**
   * The address bar, kept on the view that is on screen: `replaceState` only - no new history
   * entry, no reload, no request. Only what the reader actually chose is written, never a locked
   * parameter, and every other query parameter stays exactly as it was.
   *
   * On a host application's page that embeds `<rb-dashboard>`, the host owns its URL:
   * `urlWithValues` gives the href back unchanged there (reading still works).
   */
  function syncUrl() {
    if (typeof window === 'undefined' || !window.location) return;
    if (typeof window.history?.replaceState !== 'function') return;
    if (!parameters || parameters.length === 0) return;
    const href = window.location.href;
    const next = urlWithValues(href, reportId, parameters as any, formValues, lockedParameters);
    if (next && next !== href) window.history.replaceState(window.history.state, '', next);
  }

  // Replace all sibling rb-* components with fresh elements carrying the given params
  function applyParamsToSiblings(values: { [id: string]: any }, keepUnchanged = false) {
    if (!hostElement) return;
    // The slicers' picks ride along. A reload asked for in the filter bar re-fetches every tile, and a
    // tile asked without `__slicer_channel` would answer for every channel again - the reader would
    // watch their slicer selection undo itself. A slicer parameter is the slicer's own name and never a
    // name the author declared, so adding them here cannot overwrite a filter-bar value, a value
    // locked by a share link or anything an embed token fixed: the slicers only ever narrow.
    // A click that filters is a pick too, of a field that may have no slicer on the page: its field
    // rides along as well, or Apply would drop the click's selection while its chip stays up (the
    // same fields rb-dashboard's own refresh sends).
    const selections = slicerSelectionsFor(reportId);
    const fields = [...slicerFieldsOnPage(hostElement)];
    for (const field of selections.fields()) if (!fields.includes(field)) fields.push(field);
    const slicerPicks = selections.paramValues(fields);
    refreshDataWidgets(hostElement, { ...values, ...slicerPicks }, { keepUnchanged });
  }

  // Submit: user explicitly requests data refresh with current param values
  // Apply reloads the dashboard at once (#18): picking the values was the question, Apply the answer.
  function handleReloadClick() {
    confirmReload();
  }
  function confirmReload() {
    const values = { ...formValues };
    emitHostEvent('submit', values);
    applyParamsToSiblings(values);
  }
  /** Reset: every filter back to its default, and the dashboard reloaded with them. */
  function resetAndApply() {
    selectSearch = {};
    reset();
    confirmReload();
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

  // Reset form to defaults. The address bar follows: a value back at its default takes its key
  // away, so a dashboard nobody touched leaves the URL as it is today.
  export function reset() {
    initForm(false);
    syncUrl();
  }

  /**
   * Set filter values in place, exactly as if the reader had picked them.
   *
   * This is what a story's "Show Me" calls (`<rb-dashboard show-stories>`, TODO 5j): the values go
   * through the same acceptance check as the ones a page URL carries - declared parameters only, a
   * value outside a select's options ignored with one warning, and a locked parameter left at the
   * link's value, which the server enforces anyway. The address bar then holds the view on screen,
   * so the reader can copy the link to the story they were shown.
   *
   * Nothing is reloaded here: the caller says when, with `reloadNow()`.
   */
  export function setValues(values: { [id: string]: any }) {
    const accepted = acceptedValues(parameters as any, values || {}, lockedParameters);
    Object.keys(accepted).forEach(id => {
      formValues[id] = accepted[id];
      touched[id] = true;
    });
    formValues = formValues;
    touched = touched;
    validateAll();
    emitValues();
    syncUrl();
  }

  /**
   * Reload the widgets with the values the form holds now - the path `#btnReloadDashboard` runs,
   * without asking first. Show Me and Reset are the reader's answer to that question already.
   */
  export function reloadNow() {
    confirmReload();
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
    if (embedToken) headers['X-Embed-Token'] = embedToken;
    
    try {
      // Fetch config
      const configRes = await fetch(`${apiBaseUrl}/reports/${reportId}/config`, { headers });
      if (!configRes.ok) throw new Error(`Config fetch failed: ${configRes.status}`);
      const config = await configRes.json();
      
      if (typeof config.dataToday === 'string') dataToday = config.dataToday;

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
  <div bind:this={container} id={formId} class="rb-parameters-form">
    {#if parameters && parameters.length}
      <!-- Debug: rendering {parameters.length} parameters -->
      <form class="report-parameters-form" style="display: flex; flex-direction: column; gap: 1rem;">
        {#each parameters.filter((q) => !rangeToIds.has(q.id)) as p (p.id)}
          {@const partner = rangePartnerOf(p, parameters)}
          <div class="form-group">
            <!-- Multi-select renders its own "Choose <label>" inside the trigger button,
                 so the form-group <label> above would be a redundant repetition. Hide it
                 for that control only. All other controls keep the standalone label. -->
            {#if getControlType(p) !== 'multi-select'}
              <label for={p.id}>{paramLabel(p)}</label>
            {/if}

            {#if partner}
              <!-- One range, two declared parameters: the preset fills both, each box is its own
                   parameter as before (`#<id>From`, `#<id>To`). -->
              <div class="rb-date-range" id={p.id + '_range'} style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                <select
                  id={p.id + '_preset'}
                  class="form-control"
                  style="flex:1 1 9rem;"
                  title="Pick a period, or type the days"
                  disabled={isLocked(p) || isLocked(partner)}
                  value={presetOf(formValues[p.id], formValues[partner.id], rangeToday(dataToday))}
                  on:change={(e) => pickPreset(p, partner, e)}
                >
                  <option value="">Custom</option>
                  {#each DATE_RANGE_PRESETS as preset}
                    <option value={preset.id}>{preset.label}</option>
                  {/each}
                </select>
                <input
                  type="date"
                  id={p.id}
                  value={formValues[p.id] || ''}
                  min={resolveMin(p)}
                  max={resolveMax(p)}
                  title={p.description || paramLabel(p)}
                  disabled={isLocked(p)}
                  class="form-control"
                  style="flex:1 1 8rem;"
                  on:input={(e) => handleChange(p, e)}
                  on:blur={() => handleBlur(p)}
                />
                <span class="rb-date-range-to">to</span>
                <input
                  type="date"
                  id={partner.id}
                  value={formValues[partner.id] || ''}
                  min={resolveMin(partner)}
                  max={resolveMax(partner)}
                  title={partner.description || paramLabel(partner)}
                  disabled={isLocked(partner)}
                  class="form-control"
                  style="flex:1 1 8rem;"
                  on:input={(e) => handleChange(partner, e)}
                  on:blur={() => handleBlur(partner)}
                />
              </div>
              {#if touched[partner.id] && errors[partner.id]?.length > 0}
                <div class="text-danger validation-errors" id={partner.id + '_errors'}>
                  {#each errors[partner.id] as err}
                    <div>{err}</div>
                  {/each}
                </div>
              {/if}
            {:else if getControlType(p) === 'date' || getControlType(p) === 'date-range'}
              <input
                type="date"
                id={p.id}
                value={formValues[p.id] || ''}
                min={resolveMin(p)}
                max={resolveMax(p)}
                title={p.description || paramLabel(p)}
                disabled={isLocked(p)}
                class="form-control"
                on:input={(e) => handleChange(p, e)}
                on:blur={() => handleBlur(p)}
              />
            {:else if getControlType(p) === 'datetime'}
              <input
                type="datetime-local"
                id={p.id}
                disabled={isLocked(p)}
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
              disabled={isLocked(p)}
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
              disabled={isLocked(p)}
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
              disabled={isLocked(p)}
              checked={isTicked(formValues[p.id])}
              title={p.description || ''}
              on:change={(e) => handleChange(p, e)}
            />
          {:else if getControlType(p) === 'radio'}
            <!-- Playwright getById targets — one stable id per option, the same convention the
                 multi-select uses for its checkboxes:
                   <p.id>              the group itself (also what the form-group <label for> names)
                   <p.id>_rb_<value>   per-option radio (value sanitised via safeId)
                 The options come from loadOptions(p), so a fixed list and a SQL-backed one both
                 work, and a change goes through the same handleChange the select uses — so
                 valueChange, validation, Reload and the backend binding are untouched. -->
            <div class="rb-radio-group" id={p.id}>
              {#each shownOptions(p, '', optionsVersion) as o (o.value)}
                <label class="rb-radio-row" for={p.id + '_rb_' + safeId(o.value)}>
                  <input type="radio"
                         id={p.id + '_rb_' + safeId(o.value)}
                         name={p.id}
                         value={o.value}
                         disabled={isLocked(p)}
                         checked={String(formValues[p.id] ?? '') === String(o.value)}
                         title={p.description || ''}
                         on:change={(e) => handleChange(p, e)} />
                  <span>{o.label}</span>
                </label>
              {/each}
            </div>
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
                    disabled={isLocked(p)}
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
                <div class="rb-multi-modal" id={p.id + '_modal'} role="dialog" aria-modal="true"
                     on:click|stopPropagation
                     on:keydown|stopPropagation>
                  <div class="rb-multi-modal-title">Choose {paramLabel(p)}</div>

                  <input type="search" id={p.id + '_search'} class="form-control rb-multi-search"
                         placeholder="Search…"
                         bind:value={multiSearch[p.id]}
                         on:input={() => onMultiSearchInput(p)} />

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
                    {#each pagedVisibleOptions(p, multiSearch[p.id], multiPage[p.id], optionsVersion) as o (o.value)}
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

                  {#if pageCount(p, multiSearch[p.id], optionsVersion) > 1}
                    <div class="rb-multi-pager">
                      <button type="button"
                              id={p.id + '_btnPrevPage'}
                              disabled={(multiPage[p.id] ?? 0) === 0}
                              on:click={() => prevPage(p)}>‹ Prev</button>
                      <span id={p.id + '_lblPagePos'}>Page {(multiPage[p.id] ?? 0) + 1} of {pageCount(p, multiSearch[p.id], optionsVersion)}</span>
                      <button type="button"
                              id={p.id + '_btnNextPage'}
                              disabled={(multiPage[p.id] ?? 0) === pageCount(p, multiSearch[p.id], optionsVersion) - 1}
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
            {#if loadOptions(p).length > SELECT_SEARCH_FROM && !isLocked(p)}
              <input
                type="search"
                id={p.id + '_search'}
                class="form-control rb-select-search"
                placeholder="Search…"
                value={selectSearch[p.id] || ''}
                on:input={(e) => { selectSearch[p.id] = e.currentTarget.value; selectSearch = selectSearch; }}
              />
            {/if}
            <select
              id={p.id}
              value={formValues[p.id]}
              disabled={isLocked(p)}
              title={p.description || ''}
              class="form-control"
              on:change={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            >
              {#each shownOptions(p, selectSearch[p.id], optionsVersion) as o}
                <option value={o.value} selected={String(o.value) === String(formValues[p.id] ?? '')}>{o.label}</option>
              {/each}
            </select>
          {:else}
            <input
              type="text"
              id={p.id}
              disabled={isLocked(p)}
              value={formValues[p.id] || ''}
              title={p.description || ''}
              class="form-control"
              on:input={(e) => handleChange(p, e)}
              on:blur={() => handleBlur(p)}
            />
          {/if}

          {#if optionsDependOn(p).length > 0}
            <!-- Its options are asked again when these filters change (#17). -->
            <div class="rb-depends-note" id={p.id + '_dependsOn'} style="font-size:11px;opacity:0.7;">Follows {dependsOnLabels(p)}</div>
          {/if}

          {#if isLocked(p)}
            <!-- Says WHY the control is dead. A disabled box with no explanation reads as a bug. -->
            <div class="rb-locked-note" id={p.id + '_lockedNote'}>Fixed by this link</div>
          {/if}

          {#if touched[p.id] && errors[p.id]?.length > 0}
            <div class="text-danger validation-errors" id={p.id + '_errors'}>
              {#each errors[p.id] as err}
                <div>{err}</div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </form>
    {#if showReload}
      <div class="rb-apply-row" style="display:flex;gap:8px;margin-top:12px;">
        <button id="btnReloadDashboard" type="button" style="flex:1;padding:10px 20px;background:var(--rb-accent, var(--color-primary, #2171b5));color:var(--rb-accent-text, var(--color-primary-content, #fff));border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;" on:click={handleReloadClick}>
          Apply
        </button>
        <button id="btnResetDashboard" type="button" title="Every filter back to its default" style="padding:10px 16px;background:color-mix(in srgb, currentColor 12%, transparent);color:inherit;border:1px solid var(--rb-border, color-mix(in srgb, currentColor 18%, transparent));border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;" on:click={resetAndApply}>
          Reset
        </button>
      </div>
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
    color: var(--color-base-content, #666);
  }
  .rb-error {
    padding: 1rem;
    text-align: center;
    color: var(--color-error, #dc3545);
    background: var(--color-base-100, #fff5f5);
    border: 1px solid var(--color-error, #dc3545);
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

  /* A native <select> paints its dropdown list from its OWN background, and "transparent" there
     is not the page's colour but the browser's canvas: in a dark theme the list came out white
     while its options kept `color: inherit`, the page's near-white text, so it read as empty.
     The list gets the same opaque surface the multi-select modal uses -- still not a colour of
     our own, still the page's. */
  select.form-control {
    background: var(--rb-surface, Canvas);
  }

  .form-control:focus {
    outline: none;
    border-color: var(--rb-accent, var(--color-primary, #2171b5));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--rb-accent, var(--color-primary, #2171b5)) 25%, transparent);
  }
  
  .rb-locked-note {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-top: 0.25rem;
  }

  .text-danger {
    color: var(--color-error, #dc3545);
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
  /* Laid out inline and wrapping, so four or five options still fit the filter bar. */
  .rb-radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 2px 0;
  }
  .rb-radio-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-weight: normal;
    margin-bottom: 0;
  }
  .rb-radio-row input[type="radio"] {
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
  /* On paper (#22) the filters say what the page shows; Apply and Reset have nothing to do there. */
  @media print {
    .rb-apply-row {
      display: none !important;
    }
  }
</style>

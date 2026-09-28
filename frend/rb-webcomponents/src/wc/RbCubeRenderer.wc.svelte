<svelte:options customElement={{ tag: "rb-cube-renderer", shadow: "none" }} />

<script lang="ts">
  /**
   * The cube's field tree: what a person ticks to ask a question of a cube.
   *
   * One tree, two levels of detail. The default view shows only what is ticked or chosen
   * (the design's tier 1), most needed first: Measures, then the main table with its joined
   * tables collapsed, then Filters and Drill paths. "Show everything" is the same tree with the
   * same ids and the same tick boxes, plus one detail line per field and a small triangle for the
   * settings that need more than a line. Nothing is a second layout, so a tick never disappears
   * when the view changes.
   *
   * Which folder a dimension is in is the backend's answer, `dimensionTables`: the component does
   * no string matching of its own, so the folders and the SQL cannot disagree.
   *
   * The component never writes DSL. It receives a parsed copy of the file and sends back the ticks
   * and the name of the cube they belong to; the SQL is generated from the DSL text on the server.
   */
  import { onMount, tick, createEventDispatcher } from 'svelte';

  // Props
  export let cubeConfig: any = null;
  export let connectionId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  /** The cube editor sets it: a `public false` cube is listed, tagged "hidden", instead of left out. */
  export let showHidden: boolean = false;
  /** The cube the host means when the file holds several: it starts selected in the picker. */
  export let cubeName: string = '';
  /**
   * The filters the tree starts with, in the structured query's own shape
   * (`[{ member, operator, values }]`): W3 passes a widget's saved filters through it, so a
   * published dashboard opens filtered and the chips say by what.
   */
  export let initialFilters: any[] = [];
  /**
   * Where a filter list comes from: `fetchFilterOptions(dimension, search)` answers
   * `{ values: [[value, label], …], truncated }`.
   *
   * The component never builds a URL with a cube id of its own - the host passes the one call it may
   * make (`/api/cubes/{id}/filter-options` while a cube is being written, the runtime twin in a
   * published dashboard). Without it a dimension has no filter icon at all.
   */
  export let fetchFilterOptions: ((dimension: string, search: string) => Promise<any>) | null = null;
  /**
   * W2, the runtime mode: the published dashboard this tree lives in, and the widget in it.
   *
   * With both of them set the component loads its fields from
   * `/api/reports/{reportId}/cube/{componentId}/meta` instead of being handed a `cubeConfig`, and
   * asks `/query` for the rows itself. The cube, the cube name inside its file and the connection
   * are the dashboard's own declaration and are never sent from here: that file is the lock.
   *
   * Without them nothing of the runtime runs and this is the cube editor's preview, as before.
   */
  export let reportId: string = '';
  export let componentId: string = '';

  const dispatch = createEventDispatcher();

  let container: HTMLDivElement;

  /** The label the picker shows for a file's unnamed cube; the event and the API get `''`. */
  const DEFAULT_CUBE = '(default)';

  /** The grains a time dimension can be asked for, in the order the picker shows them. */
  const GRANULARITIES: Array<{ value: string; label: string }> = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
    { value: '', label: 'As is' },
  ];

  /** Ticking a time dimension asks for its month: the answer is readable at once (owner, 2026-09-23). */
  const DEFAULT_GRANULARITY = 'month';

  // State
  let selectedCubeName: string = '';
  let activeCube: any = null;
  /** Every cube the file holds, hidden ones included, in the order the picker would list them. */
  let allCubes: Array<{ name: string; hidden: boolean }> = [];

  // Field selection. A dimension is held as the key the generator reads: `OrderDate.month` for a
  // time dimension at a grain, `ShipCountry` for anything asked for as it is.
  let selectedDimensions: Set<string> = new Set();
  let selectedMeasures: Set<string> = new Set();
  let selectedSegments: Set<string> = new Set();

  // UX: which folders are open, which fields have their settings open, and the detail level
  let showEverything = false;
  let expandedSections: Set<string> = new Set();
  let expandedExtras: Set<string> = new Set();

  // ── Viewer filters (design part 6, W1) ──────────────────────────────────────

  /** What one dimension is filtered by, whatever control was used to say it. */
  interface FilterState {
    kind: 'list' | 'number-range' | 'date-range' | 'boolean';
    /** A list's or a Yes/No's chosen values, as the query sends them. */
    values: string[];
    /** What the chip shows for those values: an option's label when it has one. */
    labels: string[];
    from: string;
    to: string;
  }

  /** One entry per filtered dimension. This is the whole filter state; the chips are drawn from it. */
  let activeFilters: Record<string, FilterState> = {};
  /** The dimension whose popover is open, or `''`: one at a time, under its own row. */
  let openFilterFor = '';
  let filterPopover: HTMLDivElement | null = null;
  let filterParamsEl: any = null;
  /** The metadata `<rb-parameters>` is fed for the one dimension in the popover. */
  let filterParams: any[] = [];
  /** The control the open popover is showing, decided by the type and the number of values. */
  let filterKind: FilterState['kind'] = 'list';
  /** The values `<rb-parameters>` reports back; Apply is what turns them into a filter. */
  let filterDraft: Record<string, any> = {};
  /** The open list, as `[value, label]` pairs, and whether the server had to cut it. */
  let filterOptions: Array<[string, string]> = [];
  let filterTruncated = false;
  let filterLoading = false;
  let filterError = '';
  /** What `initialFilters` was last read for: the prop is adopted once per array and per cube. */
  let adoptedFilters: any = null;
  let adoptedFor = '\u0000';

  /** 20 values or fewer is a list a person can read; more of them is a from-to pair (design's table). */
  const LIST_LIMIT = 20;

  // Identity of the cube currently displayed — used to decide whether a re-bind of `cubeConfig` is
  // a genuine cube swap (the ticks go) or the host re-pushing the same cube with a new object
  // reference (the ticks stay, because they are the person's clicks).
  let activeCubeSignature: string = '';

  $: parseCubeData(cubeConfig, showHidden, cubeName);

  /** The cubes the picker lists: every cube unless one is hidden and the host did not ask for those. */
  $: visibleCubes = allCubes.filter((c) => showHidden || !c.hidden);

  // ── The file and the cube in it ──────────────────────────────────────────────

  function cubesOf(data: any): Array<{ name: string; hidden: boolean }> {
    if (!data) return [];
    const named = data.namedOptions && Object.keys(data.namedOptions).length > 0
      ? Object.keys(data.namedOptions)
      : [];
    if (named.length === 0) return [];
    const list: Array<{ name: string; hidden: boolean }> = [];
    if (data.sqlTable || data.sql || (data.dimensions && data.dimensions.length > 0)) {
      list.push({ name: DEFAULT_CUBE, hidden: data.public_ === false });
    }
    for (const name of named) {
      list.push({ name, hidden: data.namedOptions[name]?.public_ === false });
    }
    return list;
  }

  function cubeIn(data: any, name: string): any {
    if (!data) return null;
    if (!name || name === DEFAULT_CUBE) return data;
    return data.namedOptions?.[name] ?? data;
  }

  function computeCubeSignature(data: any, cubeName: string): string {
    if (!data) return '';
    const target = cubeIn(data, cubeName);
    return (target?.sqlTable || target?.sql || '') + '|' + (cubeName === DEFAULT_CUBE ? '' : cubeName || '');
  }

  function parseCubeData(data: any, _showHidden: boolean, wanted: string) {
    if (!data) {
      activeCube = null;
      allCubes = [];
      selectedCubeName = '';
      activeCubeSignature = '';
      return;
    }

    allCubes = cubesOf(data);
    if (allCubes.length > 0) {
      const listed = allCubes.filter((c) => showHidden || !c.hidden);
      const choosable = listed.length > 0 ? listed : allCubes;
      if (!selectedCubeName && wanted && choosable.some((c) => c.name === wanted)) {
        // The host says which cube it means, so that one is shown first.
        selectedCubeName = wanted;
      }
      if (!choosable.some((c) => c.name === selectedCubeName)) {
        selectedCubeName = choosable[0].name;
      }
    } else {
      selectedCubeName = '';
    }
    activeCube = cubeIn(data, selectedCubeName);

    const newSignature = computeCubeSignature(data, selectedCubeName);
    if (newSignature !== activeCubeSignature) {
      // A different cube: the old ticks are not this cube's fields.
      selectedDimensions = new Set();
      selectedMeasures = new Set();
      selectedSegments = new Set();
      expandedExtras = new Set();
      activeFilters = {};
      closeFilter();
      activeCubeSignature = newSignature;
      initExpanded();
    } else {
      // The same cube, edited: a field that is now refused cannot stay ticked.
      dropRefusedSelections();
      openFoldersOfSelection();
    }
  }

  /** The picker's own change: another cube means another set of fields, so the ticks go at once. */
  function pickCube() {
    activeCube = cubeIn(cubeConfig, selectedCubeName);
    activeCubeSignature = computeCubeSignature(cubeConfig, selectedCubeName);
    selectedDimensions = new Set();
    selectedMeasures = new Set();
    selectedSegments = new Set();
    expandedExtras = new Set();
    activeFilters = {};
    closeFilter();
    initExpanded();
    dispatchSelection();
  }

  /** The cube's name as every program outside this component knows it: `''` for the unnamed one. */
  function currentCubeName(): string {
    return !selectedCubeName || selectedCubeName === DEFAULT_CUBE ? '' : selectedCubeName;
  }

  // ── What the file says is wrong (design part 3: `warnings`) ──────────────────

  /**
   * The error the parser found on this member, or `''`. `warnings` is the whole file's list, and
   * each entry names the cube it belongs to, so a named cube shows only its own.
   */
  function errorOf(block: string, member: string): string {
    const all = cubeConfig?.warnings;
    if (!Array.isArray(all)) return '';
    const cubeName = currentCubeName();
    for (const w of all) {
      if (w?.level === 'error' && (w.cube ?? '') === cubeName && w.block === block && w.member === member) {
        return String(w.message ?? '');
      }
    }
    return '';
  }

  /** A tick on a field the generator would now refuse is taken back, and the host is told. */
  function dropRefusedSelections() {
    let changed = false;
    for (const key of [...selectedDimensions]) {
      if (errorOf('dimension', dimensionNameOf(key))) {
        selectedDimensions.delete(key);
        changed = true;
      }
    }
    for (const name of [...selectedMeasures]) {
      if (errorOf('measure', name)) {
        selectedMeasures.delete(name);
        changed = true;
      }
    }
    for (const name of [...selectedSegments]) {
      if (errorOf('segment', name)) {
        selectedSegments.delete(name);
        changed = true;
      }
    }
    for (const member of Object.keys(activeFilters)) {
      // A filter on a field the generator would now refuse would be a WHERE nobody can see.
      if (!dimensionByName(member) || errorOf('dimension', member)) {
        delete activeFilters[member];
        activeFilters = { ...activeFilters };
        if (openFilterFor === member) closeFilter();
        changed = true;
      }
    }
    if (changed) {
      selectedDimensions = new Set(selectedDimensions);
      selectedMeasures = new Set(selectedMeasures);
      selectedSegments = new Set(selectedSegments);
      dispatchSelection();
    }
  }

  // ── Folders ─────────────────────────────────────────────────────────────────

  /** A folder id a test can click: the quotes gone, anything else outside `A-Za-z0-9_-` a dash. */
  function slug(name: string): string {
    return String(name ?? '').replace(/["'`]/g, '').replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function joinLabel(j: any): string {
    return j?.title || String(j?.name ?? '').replace(/["'`]/g, '');
  }

  function initExpanded() {
    // Measures and the main table are what a person reaches for; a joined table is one click away.
    expandedSections = new Set(['measures', 'main']);
    openFoldersOfSelection();
  }

  function toggleSection(key: string) {
    if (expandedSections.has(key)) {
      expandedSections.delete(key);
    } else {
      expandedSections.add(key);
    }
    expandedSections = new Set(expandedSections);
  }

  function toggleExtras(key: string) {
    if (expandedExtras.has(key)) {
      expandedExtras.delete(key);
    } else {
      expandedExtras.add(key);
    }
    expandedExtras = new Set(expandedExtras);
  }

  /** The join a dimension is on, as the backend decided it: `''` means the main table. */
  function tableOfDimension(name: string): string {
    const table = activeCube?.dimensionTables?.[name];
    if (!table) return '';
    return joinNames().includes(table) ? table : '';
  }

  function joinNames(): string[] {
    return (activeCube?.joins || []).map((j: any) => j?.name).filter(Boolean);
  }

  /** A ticked field is never hidden: the folder it is in opens by itself. */
  function openFoldersOfSelection() {
    let changed = false;
    for (const key of selectedDimensions) {
      const table = tableOfDimension(dimensionNameOf(key));
      const folder = table ? 'join-' + table : 'main';
      if (!expandedSections.has(folder)) {
        expandedSections.add(folder);
        changed = true;
      }
      if (table && !expandedSections.has('main')) {
        expandedSections.add('main');
        changed = true;
      }
    }
    if (changed) expandedSections = new Set(expandedSections);
  }

  // ── Ticks ───────────────────────────────────────────────────────────────────

  /** The dimension a selection key belongs to: `OrderDate.month` → `OrderDate`. */
  function dimensionNameOf(key: string): string {
    const dot = key.indexOf('.');
    return dot < 0 ? key : key.slice(0, dot);
  }

  function keysOfDimension(name: string): string[] {
    return [...selectedDimensions].filter((k) => k === name || k.startsWith(name + '.'));
  }

  function isDimensionSelected(name: string): boolean {
    return keysOfDimension(name).length > 0;
  }

  /** The grain a ticked time dimension is asked at: `''` is "As is". */
  function granularityOf(name: string): string {
    const key = keysOfDimension(name)[0];
    if (!key) return DEFAULT_GRANULARITY;
    const dot = key.indexOf('.');
    return dot < 0 ? '' : key.slice(dot + 1);
  }

  function defaultKeyOf(dim: any): string {
    return dim?.type === 'time' ? dim.name + '.' + DEFAULT_GRANULARITY : dim.name;
  }

  function dimensionByName(name: string): any {
    return (activeCube?.dimensions || []).find((d: any) => d?.name === name);
  }

  function toggleDimension(dim: any) {
    if (errorOf('dimension', dim.name)) return;
    const keys = keysOfDimension(dim.name);
    if (keys.length > 0) {
      for (const key of keys) selectedDimensions.delete(key);
    } else {
      selectedDimensions.add(defaultKeyOf(dim));
    }
    selectedDimensions = new Set(selectedDimensions);
    openFoldersOfSelection();
    dispatchSelection();
  }

  function setGranularity(dim: any, granularity: string) {
    for (const key of keysOfDimension(dim.name)) selectedDimensions.delete(key);
    selectedDimensions.add(granularity ? dim.name + '.' + granularity : dim.name);
    selectedDimensions = new Set(selectedDimensions);
    dispatchSelection();
  }

  function toggleMeasure(meas: any) {
    if (errorOf('measure', meas.name)) return;
    if (selectedMeasures.has(meas.name)) {
      selectedMeasures.delete(meas.name);
    } else {
      selectedMeasures.add(meas.name);
    }
    selectedMeasures = new Set(selectedMeasures);
    dispatchSelection();
  }

  function toggleSegment(seg: any) {
    if (errorOf('segment', seg.name)) return;
    if (selectedSegments.has(seg.name)) {
      selectedSegments.delete(seg.name);
    } else {
      selectedSegments.add(seg.name);
    }
    selectedSegments = new Set(selectedSegments);
    dispatchSelection();
  }

  // ── Drill paths ─────────────────────────────────────────────────────────────

  function levelsOf(h: any): string[] {
    if (Array.isArray(h?.levels)) return h.levels.map((l: any) => String(l));
    if (h?.levels) return [String(h.levels)];
    return [];
  }

  /**
   * A level is the same selection as the dimension's own box. Ticking one asks for it and for
   * every level above it, because a city without its country is not a drill path; unticking one
   * lets go of it and of everything below it.
   */
  function toggleLevel(h: any, index: number) {
    const levels = levelsOf(h);
    const name = levels[index];
    const dim = dimensionByName(name);
    if (!dim || errorOf('dimension', name)) return;

    if (isDimensionSelected(name)) {
      for (let i = index; i < levels.length; i++) {
        for (const key of keysOfDimension(levels[i])) selectedDimensions.delete(key);
      }
    } else {
      for (let i = 0; i <= index; i++) {
        const above = dimensionByName(levels[i]);
        if (above && !isDimensionSelected(levels[i]) && !errorOf('dimension', levels[i])) {
          selectedDimensions.add(defaultKeyOf(above));
        }
      }
    }
    selectedDimensions = new Set(selectedDimensions);
    openFoldersOfSelection();
    dispatchSelection();
  }

  // ── Viewer filters: the icon, the popover, the chips ────────────────────────

  /**
   * A dimension can be filtered unless it is a place on a map: everything else has a control
   * (design's control table). Measures have none, and neither has a field the parser refused.
   */
  function isFilterable(dim: any): boolean {
    return !!fetchFilterOptions && !!dim?.name && dim?.type !== 'geo' && !errorOf('dimension', dim.name);
  }

  function hasFilter(name: string): boolean {
    return !!activeFilters[name];
  }

  function titleOf(name: string): string {
    return dimensionByName(name)?.title || name;
  }

  /** Is this dimension's list of values a list of numbers? Then its length decides the control. */
  function isNumeric(dim: any): boolean {
    return dim?.type === 'number' || dim?.type === 'integer' || dim?.type === 'decimal';
  }

  /** The control a dimension is filtered with before any list has been counted. */
  function controlOf(dim: any): FilterState['kind'] {
    if (dim?.type === 'time') return 'date-range';
    if (dim?.type === 'boolean') return 'boolean';
    return 'list';
  }

  /** The label a value is shown by: the fetched one, or the value itself. */
  function labelOf(value: string): string {
    const found = filterOptions.find((o) => o[0] === value);
    return found ? found[1] : value;
  }

  // The popover is one `<rb-parameters>`, fed the metadata for this one dimension. The controls are
  // the report parameters' own, the binding is not: a filter is a member, an operator and values.

  function listParam(dim: any, state: FilterState | undefined): any[] {
    return [{
      id: dim.name,
      type: 'string',
      label: titleOf(dim.name),
      defaultValue: (state?.values || []).join(','),
      uiHints: { control: 'multi-select', options: filterOptions, remoteSearch: filterTruncated },
    }];
  }

  /**
   * The from-to pair, cross-referenced exactly as the `par-employee-hire-dates` sample writes it by
   * hand: each box's limit is the other box's value, so a range cannot be asked for backwards.
   *
   * `decimal` is the control table's "number": it is the name `parameter-controls.ts` and the
   * backend's own conversion know a number by, and the one that draws a number box.
   */
  function rangeParams(dim: any, state: FilterState | undefined, type: 'decimal' | 'date'): any[] {
    const from = dim.name + '__from';
    const to = dim.name + '__to';
    return [
      { id: from, type, label: titleOf(dim.name) + ' from', defaultValue: state?.from ?? '',
        constraints: { max: { name: to } } },
      { id: to, type, label: titleOf(dim.name) + ' to', defaultValue: state?.to ?? '',
        constraints: { min: { name: from } } },
    ];
  }

  function booleanParam(dim: any, state: FilterState | undefined): any[] {
    return [{
      id: dim.name,
      type: 'string',
      label: titleOf(dim.name),
      defaultValue: state?.values?.[0] ?? '',
      uiHints: { control: 'select', options: [['', 'Any'], ['true', 'Yes'], ['false', 'No']] },
    }];
  }

  /**
   * The dimension's values, and for a number the choice the author never has to make: 20 values or
   * fewer is a list, more of them is a range (so `Discontinued`, `ReportsTo` and `Year` are lists
   * with no DSL key at all).
   */
  async function loadFilterOptions(dim: any, search: string) {
    filterLoading = true;
    filterError = '';
    try {
      const answer = await fetchFilterOptions!(dim.name, search);
      const rows = Array.isArray(answer?.values) ? answer.values : [];
      filterOptions = rows.map((row: any): [string, string] => Array.isArray(row)
        ? [String(row[0] ?? ''), String(row[1] ?? row[0] ?? '')]
        : [String(row), String(row)]);
      filterTruncated = !!answer?.truncated;
      if (isNumeric(dim) && !dim?.filter_options && !search
          && (filterTruncated || filterOptions.length > LIST_LIMIT)) {
        filterKind = 'number-range';
      }
    } catch (e: any) {
      filterError = String(e?.message || e || 'The values of this field could not be read.');
      filterOptions = [];
      filterTruncated = false;
    }
    filterLoading = false;
  }

  /** Clicking the icon of the open popover closes it again; clicking another dimension's moves it. */
  async function openFilter(dim: any) {
    if (!isFilterable(dim)) return;
    if (openFilterFor === dim.name) {
      closeFilter();
      return;
    }
    const state = activeFilters[dim.name];
    openFilterFor = dim.name;
    filterError = '';
    filterOptions = [];
    filterTruncated = false;
    filterDraft = {};
    filterParams = [];
    filterParamsEl = null;
    filterKind = controlOf(dim);

    if (filterKind === 'date-range') {
      filterParams = rangeParams(dim, state, 'date');
      return;
    }
    if (filterKind === 'boolean') {
      filterParams = booleanParam(dim, state);
      return;
    }
    await loadFilterOptions(dim, '');
    // The person may have closed it, or opened another one, while the values were coming.
    if (openFilterFor !== dim.name) return;
    filterParams = filterKind === 'number-range'
      ? rangeParams(dim, state, 'decimal')
      : listParam(dim, state);
  }

  function closeFilter() {
    openFilterFor = '';
    filterParams = [];
    filterParamsEl = null;
    filterDraft = {};
    filterLoading = false;
  }

  /** Every change in the popover, kept as the draft: nothing of it is a filter until Apply. */
  function onFilterValues(event: any) {
    const values = event?.detail;
    if (values && typeof values === 'object') filterDraft = { ...values };
  }

  /**
   * A cut list is searched where it lives: the answer replaces the options in place, so the modal
   * the person is typing in stays open with its ticks.
   */
  async function onFilterSearch(event: any) {
    const dim = dimensionByName(openFilterFor);
    if (!dim || filterKind !== 'list') return;
    await loadFilterOptions(dim, String(event?.detail?.search ?? ''));
    if (openFilterFor !== dim.name) return;
    filterParamsEl?.setOptions?.(dim.name, filterOptions);
  }

  /** What the controls hold now: the element itself when it can be asked, else the last change. */
  function draftValues(): Record<string, any> {
    const asked = filterParamsEl?.getValues?.();
    return asked && typeof asked === 'object' ? asked : filterDraft;
  }

  function applyFilter() {
    const dim = dimensionByName(openFilterFor);
    if (!dim) {
      closeFilter();
      return;
    }
    const values = draftValues();
    const state: FilterState = { kind: filterKind, values: [], labels: [], from: '', to: '' };
    if (filterKind === 'list' || filterKind === 'boolean') {
      const said = String(values[dim.name] ?? '').trim();
      // '*' is the multi-select's "All", which is every value there is - that is no filter at all,
      // and saying it as a list of the values that were fetched would be a different question.
      state.values = said === '*' ? [] : said.split(',').map((v) => v.trim()).filter(Boolean);
      state.labels = filterKind === 'boolean'
        ? state.values.map((v) => (v === 'true' ? 'Yes' : v === 'false' ? 'No' : v))
        : state.values.map(labelOf);
    } else {
      state.from = String(values[dim.name + '__from'] ?? '').trim();
      state.to = String(values[dim.name + '__to'] ?? '').trim();
    }

    if (state.values.length === 0 && !state.from && !state.to) {
      delete activeFilters[dim.name];
    } else {
      activeFilters[dim.name] = state;
    }
    activeFilters = { ...activeFilters };
    closeFilter();
    dispatchSelection();
  }

  /** Clear empties the controls' answer for this dimension: the chip goes with it. */
  function clearFilter() {
    if (openFilterFor) removeFilter(openFilterFor);
    closeFilter();
  }

  function removeFilter(member: string) {
    if (!activeFilters[member]) return;
    delete activeFilters[member];
    activeFilters = { ...activeFilters };
    if (openFilterFor === member) closeFilter();
    dispatchSelection();
  }

  /**
   * The filters as the structured query takes them, one entry per operator: a date range with both
   * ends is one `between`, a number range is `gte` and `lte`, and an end nobody filled in is not
   * sent at all.
   */
  function filtersOf(): Array<{ member: string; operator: string; values: string[] }> {
    const out: Array<{ member: string; operator: string; values: string[] }> = [];
    for (const member of Object.keys(activeFilters)) {
      const f = activeFilters[member];
      if (f.kind === 'date-range' || f.kind === 'number-range') {
        if (f.kind === 'date-range' && f.from && f.to) {
          out.push({ member, operator: 'between', values: [f.from, f.to] });
          continue;
        }
        if (f.from) out.push({ member, operator: 'gte', values: [f.from] });
        if (f.to) out.push({ member, operator: 'lte', values: [f.to] });
        continue;
      }
      if (f.values.length > 0) out.push({ member, operator: 'in', values: [...f.values] });
    }
    return out;
  }

  /** What one chip says after its title: the labels, or the range, and how many were left out. */
  function chipValues(f: FilterState): string {
    if (f.kind === 'date-range' || f.kind === 'number-range') {
      if (f.from && f.to) return f.from + ' \u2192 ' + f.to;
      return f.from ? '\u2265 ' + f.from : '\u2264 ' + f.to;
    }
    const shown = f.labels.length === f.values.length ? f.labels : f.values;
    if (shown.length > 3) return shown.slice(0, 2).join(', ') + ' +' + (shown.length - 2);
    return shown.join(', ');
  }

  /**
   * `initialFilters` read into the same state a click writes, so a started dashboard and a clicked
   * one are one path. A filter naming a member this cube has not got is left out.
   */
  function adoptFilters(list: any, signature: string) {
    if (list === adoptedFilters && signature === adoptedFor) return;
    adoptedFilters = list;
    adoptedFor = signature;
    activeFilters = filterStatesOf(list);
  }

  /**
   * The structured query's filters as the tree holds them. `initialFilters`, a live widget's own
   * `initial` and Show Me's `applySelection` all come through here, so a started dashboard, a
   * published one and a hint are one path, and the chips say the same thing whichever it was.
   */
  function filterStatesOf(list: any): Record<string, FilterState> {
    const next: Record<string, FilterState> = {};
    for (const f of Array.isArray(list) ? list : []) {
      const member = String(f?.member ?? '');
      const dim = member ? dimensionByName(member) : null;
      if (!dim) continue;
      const values = (Array.isArray(f?.values) ? f.values : [f?.values])
        .filter((v: any) => v !== null && v !== undefined && v !== '')
        .map((v: any) => String(v));
      const state = next[member] || { kind: controlOf(dim), values: [], labels: [], from: '', to: '' };
      const operator = String(f?.operator ?? 'in');
      if (operator === 'between' || operator === 'gte' || operator === 'lte') {
        if (state.kind === 'list') state.kind = 'number-range';
        if (operator === 'between') {
          state.from = values[0] ?? '';
          state.to = values[1] ?? '';
        } else if (operator === 'gte') {
          state.from = values[0] ?? '';
        } else {
          state.to = values[0] ?? '';
        }
      } else {
        state.values = values;
        // Nobody has fetched this list yet, so a value is its own label until someone opens it.
        state.labels = values;
      }
      next[member] = state;
    }
    return next;
  }

  $: adoptFilters(initialFilters, activeCubeSignature);

  $: filterChips = Object.keys(activeFilters).map((member) => ({
    member,
    text: titleOf(member) + ': ' + chipValues(activeFilters[member]),
  }));

  /** Esc closes the popover, and so does a click anywhere outside it: neither applies anything. */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openFilterFor) closeFilter();
  }

  function onWindowPointerDown(event: Event) {
    if (!openFilterFor) return;
    const target = event.target as Node | null;
    // A click inside `<rb-parameters>` is reported as the element itself, so this holds for the
    // whole popover, its multi-select modal included.
    if (target && filterPopover?.contains(target)) return;
    if (target instanceof Element && target.closest('.rb-filter-icon')) return;
    closeFilter();
  }

  // ── What the host is told ────────────────────────────────────────────────────

  function dispatchSelection() {
    const granularities: Record<string, string> = {};
    for (const key of selectedDimensions) {
      const dot = key.indexOf('.');
      if (dot > 0) granularities[key.slice(0, dot)] = key.slice(dot + 1);
    }
    dispatch('selectionChanged', {
      cubeName: currentCubeName(),
      selectedDimensions: [...selectedDimensions],
      selectedMeasures: [...selectedMeasures],
      selectedSegments: [...selectedSegments],
      granularities,
      selectedFilters: filtersOf(),
      selectedOrder: [...selectedOrder],
      selectedLimit,
    });
    // W2: the change the host is told about is the change the live cube answers.
    scheduleQuery();
  }

  // ── W2: the live cube of a published dashboard ───────────────────────

  /** Both runtime props set: this tree is a dashboard's live cube, not the cube editor's preview. */
  $: runtime = !!reportId && !!componentId;

  /** `value`, `chart`, `table` or `''` — the dashboard's say in how its answer is drawn. */
  let runtimeDisplay = '';
  let runtimeRows: any[] = [];
  let runtimeTruncated = false;
  /** A refusal or a failure, in words: it is shown where the answer would be, and never swallowed. */
  let runtimeError = '';
  let runtimeLoading = false;
  let runtimeStarted = false;
  let mounted = false;

  /** What a hint can ask for and no tick box can: the order, and how many rows. */
  let selectedOrder: Array<{ member: string; dir: string }> = [];
  let selectedLimit: number | null = null;

  /** Ticking three boxes is one question, not three (the design's 300 ms). */
  const QUERY_DEBOUNCE = 300;
  let queryTimer: any = null;
  /** One question in flight; a selection made while it is out is asked next, and it wins. */
  let queryRunning = false;
  let queryQueued = false;

  $: nothingTicked = selectedMeasures.size === 0 && selectedDimensions.size === 0;

  /** The one credential an embedded page can carry, the same one every other rb-* component sends. */
  function runtimeHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (embedToken) headers['X-Embed-Token'] = embedToken;
    return headers;
  }

  /** `…/reports/{reportId}/cube/{componentId}/{what}`: the three runtime endpoints, and no other. */
  function runtimeUrl(what: string): string {
    return apiBaseUrl + '/reports/' + encodeURIComponent(reportId) + '/cube/'
      + encodeURIComponent(componentId) + '/' + what;
  }

  /** A refused answer carries `{ error }`; anything else says what it was by its status. */
  async function runtimeAnswer(response: Response, what: string): Promise<any> {
    const answer = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(answer?.error || what + ' (' + response.status + ').'));
    return answer;
  }

  async function startRuntime() {
    runtimeStarted = true;
    // The list a filter popover offers comes from this dashboard's own endpoint: the component still
    // builds no URL of a cube's own, and no cube id is in one.
    if (!fetchFilterOptions) fetchFilterOptions = runtimeFilterOptions;
    await loadRuntimeMeta();
  }

  /** The values of one dimension, through the runtime twin of the cube editor's endpoint. */
  async function runtimeFilterOptions(dimension: string, search: string): Promise<any> {
    const response = await fetch(runtimeUrl('filter-options'), {
      method: 'POST',
      headers: runtimeHeaders(),
      body: JSON.stringify({ dimension, search }),
    });
    return await runtimeAnswer(response, 'The values of this field could not be read');
  }

  /**
   * `/meta` is the whole cube this viewer may ask about. The tree is built from it exactly as it is
   * built from a parsed file, and then the dashboard's own opening selection is applied as a tick
   * would be — `initial` and a click are one path.
   */
  async function loadRuntimeMeta() {
    runtimeError = '';
    try {
      const response = await fetch(runtimeUrl('meta'), { headers: runtimeHeaders() });
      const meta = await runtimeAnswer(response, 'This live cube could not be read');
      runtimeDisplay = String(meta?.display ?? '');
      cubeConfig = cubeOfMeta(meta);
      // The tree reads the new cube first: `initial` names its fields.
      await tick();
      applySelection(meta?.initial ?? {});
    } catch (e: any) {
      runtimeError = String(e?.message || e || 'This live cube could not be read.');
      runtimeRows = [];
      runtimeTruncated = false;
    }
  }

  /**
   * `/meta` in the shape the tree already knows. There is no `sqlTable` and no `warnings` in it: a
   * viewer is told what the cube offers, never how it reads it. `hasFilterOptions` becomes the
   * `filter_options` the popover asks about, which is the key the editor's own copy carries.
   */
  function cubeOfMeta(meta: any): any {
    return {
      title: meta?.title,
      description: meta?.description,
      dimensions: (meta?.dimensions ?? []).map((d: any) => (d?.hasFilterOptions
        ? { ...d, filter_options: true }
        : { ...d })),
      measures: meta?.measures ?? [],
      segments: meta?.segments ?? [],
      hierarchies: meta?.hierarchies ?? [],
    };
  }

  /**
   * The question, in the generator's own request keys and only those. The cube, the cube name and
   * the connection are the widget file's; a request that carried them would be refused.
   */
  function runtimeRequest(): any {
    const dimensions: string[] = [];
    const granularities: Record<string, string> = {};
    for (const key of selectedDimensions) {
      const dot = key.indexOf('.');
      const name = dot > 0 ? key.slice(0, dot) : key;
      dimensions.push(name);
      if (dot > 0) granularities[name] = key.slice(dot + 1);
    }
    const request: any = {
      dimensions,
      measures: [...selectedMeasures],
      segments: [...selectedSegments],
      granularities,
      filters: filtersOf(),
    };
    if (selectedOrder.length > 0) request.order = selectedOrder.map((o) => ({ member: o.member, dir: o.dir }));
    if (selectedLimit) request.limit = selectedLimit;
    return request;
  }

  function scheduleQuery() {
    if (!runtime || !activeCube) return;
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(runQuery, QUERY_DEBOUNCE);
  }

  /**
   * One `/query` at a time. A selection made while one is out is asked as soon as that one is back,
   * and the answer it overtook is dropped rather than drawn: what is on the screen is the answer to
   * the last thing that was ticked.
   */
  async function runQuery() {
    queryTimer = null;
    if (!runtime) return;
    if (nothingTicked) {
      runtimeRows = [];
      runtimeTruncated = false;
      runtimeError = '';
      runtimeLoading = false;
      return;
    }
    if (queryRunning) {
      queryQueued = true;
      return;
    }
    queryRunning = true;
    runtimeLoading = true;
    try {
      const response = await fetch(runtimeUrl('query'), {
        method: 'POST',
        headers: runtimeHeaders(),
        body: JSON.stringify(runtimeRequest()),
      });
      const answer = await runtimeAnswer(response, 'This question could not be answered');
      if (!queryQueued) {
        runtimeRows = Array.isArray(answer?.rows) ? answer.rows : [];
        runtimeTruncated = !!answer?.truncated;
        runtimeError = '';
      }
    } catch (e: any) {
      if (!queryQueued) {
        runtimeRows = [];
        runtimeTruncated = false;
        runtimeError = String(e?.message || e || 'This question could not be answered.');
      }
    } finally {
      queryRunning = false;
      if (queryQueued) {
        queryQueued = false;
        runQuery();
      } else {
        runtimeLoading = false;
      }
    }
  }

  // ── How the answer is drawn: the rb-* components there already are ──────────

  /** A ticked place on a map is a map (W4.7). */
  function geoTicked(dimensions: Set<string>, cube: any): boolean {
    for (const key of dimensions) {
      const name = dimensionNameOf(key);
      if ((cube?.dimensions || []).find((d: any) => d?.name === name)?.type === 'geo') return true;
    }
    return false;
  }

  /**
   * Which component draws the answer. No new one is written for this: the dashboard's `display`
   * decides, and where it says nothing the shape of the answer does — one number is a number, and
   * anything else nobody asked a chart of is a table.
   */
  function shapeOf(display: string, rows: any[], dimensions: Set<string>, measures: Set<string>,
      cube: any): string {
    if (display === 'value' || (rows.length === 1 && measures.size === 1 && dimensions.size === 0)) {
      return 'value';
    }
    if (display === 'chart' && dimensions.size >= 1 && measures.size >= 1) return 'chart';
    if (geoTicked(dimensions, cube)) return 'map';
    return 'table';
  }

  $: resultShape = shapeOf(runtimeDisplay, runtimeRows, selectedDimensions, selectedMeasures, activeCube);

  /** The ticked fields under the names the answer's columns carry: a grain comes back plain. */
  $: askedDimensions = [...selectedDimensions].map((key) => dimensionNameOf(key));
  $: askedMeasures = [...selectedMeasures];

  $: valueField = askedMeasures[0] ?? askedDimensions[0] ?? '';
  $: valueFormat = String(measureByName(valueField)?.format ?? '');

  /**
   * A chart out of rows: the first ticked dimension is the labels, and every ticked measure is one
   * dataset of its own. A second dimension is in the rows, not in the chart, and the note under it
   * says so rather than leaving a person to wonder.
   */
  function chartOf(rows: any[], dimensions: string[], measures: string[]): any {
    return {
      labels: rows.map((row) => String(row?.[dimensions[0]] ?? '')),
      datasets: measures.map((name) => ({
        label: measureTitle(name),
        data: rows.map((row) => Number(row?.[name] ?? 0)),
      })),
    };
  }

  $: chartData = resultShape === 'chart'
    ? chartOf(runtimeRows, askedDimensions, askedMeasures)
    : { labels: [], datasets: [] };

  // ── Show Me: one call applies a whole selection (design part 8) ───────────

  function measureByName(name: string): any {
    return (activeCube?.measures || []).find((m: any) => m?.name === name);
  }

  function segmentByName(name: string): any {
    return (activeCube?.segments || []).find((s: any) => s?.name === name);
  }

  function listOf(value: any): any[] {
    if (Array.isArray(value)) return value;
    return value === null || value === undefined || value === '' ? [] : [value];
  }

  /** Nothing is changed and the one thing that was wrong is named: never half a selection. */
  function refuseSelection(kind: string, name: string): boolean {
    runtimeError = 'This cube has no ' + kind + ' called ‘' + name + '’.';
    return false;
  }

  /**
   * One call replaces everything that is ticked: Show Me's hint, and a live widget's own `initial`.
   *
   * It writes the state a click writes and nothing else — the dimension keys with their grain, the
   * measure and segment names, the filter states the chips are drawn from — so the boxes, the grain
   * pickers and the filter icons show exactly what was asked for and the person can carry on from
   * there. Then `selectionChanged` fires once and one `/query` follows, as a tick's does: the one
   * code path it shares with the clicks is `dispatchSelection`, which is also where the query is
   * scheduled from.
   *
   * A member this cube has not got changes nothing at all: the error line names it. What a member is
   * checked by is the tree's own `dimensionByName` and `errorOf`, which is what refuses a click too.
   */
  export function applySelection(query: any): boolean {
    const asked = query && typeof query === 'object' ? query : {};

    // The cube first, when a hint names another of the file's: its fields are what the rest of the
    // hint is then checked against. At runtime there is nothing to choose — the cube and the cube
    // name inside its file are the widget file's own, and a name in the request is refused there.
    const wantedCube = runtime ? '' : String(asked.cubeName ?? '').trim();
    if (wantedCube && wantedCube !== currentCubeName()) {
      if (!allCubes.some((c) => c.name === wantedCube)) {
        runtimeError = 'This file has no cube called ‘' + wantedCube + '’.';
        return false;
      }
      selectedCubeName = wantedCube;
      activeCube = cubeIn(cubeConfig, selectedCubeName);
      activeCubeSignature = computeCubeSignature(cubeConfig, selectedCubeName);
      expandedExtras = new Set();
      initExpanded();
    }

    const grains: Record<string, string> = {};
    if (asked.granularities && typeof asked.granularities === 'object') {
      for (const name of Object.keys(asked.granularities)) {
        const grain = String(asked.granularities[name] ?? '').trim();
        if (!grain) continue;
        if (!dimensionByName(name) || errorOf('dimension', name)) return refuseSelection('dimension', name);
        grains[name] = grain;
      }
    }

    const dimensionKeys: string[] = [];
    for (const entry of listOf(asked.dimensions)) {
      const said = typeof entry === 'string' ? entry : String(entry?.name ?? '');
      const dot = said.indexOf('.');
      const name = dot > 0 ? said.slice(0, dot) : said;
      if (!name) continue;
      const dim = dimensionByName(name);
      if (!dim || errorOf('dimension', name)) return refuseSelection('dimension', name);
      const grain = dot > 0
        ? said.slice(dot + 1)
        : String((entry && typeof entry === 'object' ? entry.granularity : '') ?? '') || grains[name] || '';
      // A time dimension asked for without a grain gets the grain a tick gives it.
      dimensionKeys.push(grain ? name + '.' + grain : defaultKeyOf(dim));
    }

    const measureNames: string[] = [];
    for (const entry of listOf(asked.measures)) {
      const name = typeof entry === 'string' ? entry : String(entry?.name ?? '');
      if (!name) continue;
      if (!measureByName(name) || errorOf('measure', name)) return refuseSelection('measure', name);
      measureNames.push(name);
    }

    const segmentNames: string[] = [];
    for (const entry of listOf(asked.segments)) {
      const name = typeof entry === 'string' ? entry : String(entry?.name ?? '');
      if (!name) continue;
      if (!segmentByName(name) || errorOf('segment', name)) return refuseSelection('segment', name);
      segmentNames.push(name);
    }

    // A filter of this tree is a filter on a dimension: that is what has an icon, a popover and a
    // chip, so a hint that filters anything else is refused rather than quietly dropped.
    const filters = listOf(asked.filters);
    for (const one of filters) {
      const member = String(one?.member ?? '');
      if (!member) continue;
      if (!dimensionByName(member) || errorOf('dimension', member)) {
        return refuseSelection('dimension', member);
      }
    }

    const order: Array<{ member: string; dir: string }> = [];
    for (const entry of listOf(asked.order)) {
      const said = typeof entry === 'string'
        ? entry.trim().split(/\s+/)
        : [String(entry?.member ?? ''), String(entry?.dir ?? '')];
      const member = said[0] || '';
      if (!member) continue;
      if (!measureByName(member) && (!dimensionByName(member) || errorOf('dimension', member))) {
        return refuseSelection('member', member);
      }
      order.push({ member, dir: String(said[1] || '').toLowerCase() === 'desc' ? 'desc' : 'asc' });
    }

    const limit = Number(asked.limit);

    selectedDimensions = new Set(dimensionKeys);
    selectedMeasures = new Set(measureNames);
    selectedSegments = new Set(segmentNames);
    selectedOrder = order;
    selectedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
    activeFilters = filterStatesOf(filters);
    // What was just applied is the selection: the `initialFilters` prop is not read over it again.
    adoptedFilters = initialFilters;
    adoptedFor = activeCubeSignature;
    closeFilter();
    openFoldersOfSelection();
    runtimeError = '';
    dispatchSelection();
    return true;
  }

  // ── Tooltips: plain words, never SQL (tier 2) ────────────────────────────────

  function cut(text: string, max = 60): string {
    const one = String(text ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
  }

  /** The `${Name}` references a calculated measure reads, in the order they are written. */
  function referencedMeasures(sql: string): string[] {
    const found: string[] = [];
    const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    let match = pattern.exec(String(sql ?? ''));
    while (match) {
      if (match[1] !== 'CUBE' && !found.includes(match[1])) found.push(match[1]);
      match = pattern.exec(String(sql ?? ''));
    }
    return found;
  }

  function measureTitle(name: string): string {
    return measureByName(name)?.title || name;
  }

  /** The join a `sub_query` dimension reads its one value from: `${Products.Count}` → Products. */
  function subQuerySource(sql: string): string {
    const match = /\$\{([^}.]+)\.[^}]+\}/.exec(String(sql ?? ''));
    return match ? match[1].replace(/["'`]/g, '') : '';
  }

  function caseLabels(dim: any): string[] {
    const labels: string[] = [];
    for (const when of dim?.case?.when || []) {
      if (when?.label) labels.push(String(when.label));
    }
    if (dim?.case?.else?.label) labels.push(String(dim.case.else.label));
    return labels;
  }

  /** The lines that say what a dimension means, beyond its label. */
  function dimensionFacts(dim: any): string[] {
    const facts: string[] = [];
    if (dim?.case) {
      const labels = caseLabels(dim);
      if (labels.length > 0) facts.push('Labels: ' + labels.join(' / '));
    }
    if (dim?.type === 'geo') {
      facts.push('Map point: two columns, ' + dim.name + '_lat and ' + dim.name + '_lng');
    }
    if (isTrue(dim?.sub_query)) {
      const source = subQuerySource(dim?.sql);
      facts.push('One value per row' + (source ? ', from ' + source : ''));
    }
    return facts;
  }

  /** The lines that say what a measure means, beyond its label. */
  function measureFacts(meas: any): string[] {
    const facts: string[] = [];
    const conditions = (meas?.filters || []).map((f: any) => String(f?.sql ?? '')).filter(Boolean);
    if (conditions.length > 0) {
      facts.push('Filtered: only rows where ' + cut(conditions.join(' AND ')));
    }
    const base = referencedMeasures(meas?.sql).map(measureTitle);
    const baseName = base.length > 0 ? base[0] : '';
    if (isTrue(meas?.share_of_total)) {
      facts.push('Share of the total' + (baseName ? ' of ' + baseName : ''));
    } else if (meas?.rolling_window) {
      const window = meas.rolling_window;
      if (String(window?.type ?? '') === 'to_date') {
        facts.push((baseName || 'This measure') + ' ' + String(window?.granularity ?? 'year') + ' to date');
      } else {
        facts.push('Running total' + (baseName ? ' of ' + baseName : ''));
      }
      facts.push('needs a date field');
    } else if (meas?.time_shift) {
      const interval = String(meas.time_shift?.interval ?? '').trim();
      facts.push((baseName || 'This measure') + (interval ? ' ' + interval + ' earlier' : ' earlier'));
      facts.push('needs a date field');
    } else if (String(meas?.type ?? '') === 'number' && base.length > 0) {
      facts.push('Calculated from ' + base.join(', '));
    }
    return facts;
  }

  function isTrue(value: any): boolean {
    return value === true || value === 'true';
  }

  /** The description first, then one short line per fact; an error replaces all of it. */
  function tooltip(block: string, member: any, facts: string[]): string {
    const error = errorOf(block, member?.name);
    if (error) return error;
    const lines: string[] = [];
    if (member?.description) lines.push(String(member.description));
    for (const fact of facts) lines.push(fact);
    return lines.join('\n');
  }

  // ── "Show everything": the detail line and the settings under the triangle ───

  /** The one extra line every field gets: its name, its type and its SQL. */
  function detailLine(member: any, kind: string): string {
    const parts: string[] = [String(member?.name ?? '')];
    if (kind === 'dimension') parts.push(String(member?.type || 'string'));
    else if (kind === 'measure') parts.push(String(member?.type || 'count'));
    if (member?.sql) parts.push(String(member.sql));
    return parts.join(' · ');
  }

  /** The settings that need more than a line, as label/value pairs. */
  function extrasOf(member: any, kind: string): Array<{ label: string; value: string }> {
    const extras: Array<{ label: string; value: string }> = [];
    if (kind === 'measure') {
      for (const filter of member?.filters || []) {
        if (filter?.sql) extras.push({ label: 'filter', value: String(filter.sql) });
      }
      if (isTrue(member?.share_of_total)) extras.push({ label: 'share_of_total', value: 'true' });
      if (member?.rolling_window) extras.push({ label: 'rolling_window', value: pairs(member.rolling_window) });
      if (member?.time_shift) extras.push({ label: 'time_shift', value: pairs(member.time_shift) });
    }
    if (kind === 'dimension') {
      for (const when of member?.case?.when || []) {
        extras.push({ label: 'when ' + String(when?.sql ?? ''), value: String(when?.label ?? '') });
      }
      if (member?.case?.else) extras.push({ label: 'else', value: String(member.case.else.label ?? '') });
      if (member?.latitude?.sql) extras.push({ label: 'latitude', value: String(member.latitude.sql) });
      if (member?.longitude?.sql) extras.push({ label: 'longitude', value: String(member.longitude.sql) });
      if (isTrue(member?.sub_query)) extras.push({ label: 'sub_query', value: String(member?.sql ?? '') });
      if (member?.filter_options) extras.push({ label: 'filter_options', value: String(member.filter_options) });
      if (member?.order) extras.push({ label: 'order', value: String(member.order) });
    }
    return extras;
  }

  function pairs(value: any): string {
    if (value && typeof value === 'object') {
      return Object.keys(value).map((k) => k + ': ' + String(value[k])).join(', ');
    }
    return String(value);
  }

  /** The cube's own facts, shown above the tree in "Show everything" (tier 3). */
  function cubeFacts(cube: any): Array<{ label: string; value: string }> {
    const facts: Array<{ label: string; value: string }> = [];
    if (!cube) return facts;
    if (cube.sqlTable) facts.push({ label: 'Table', value: String(cube.sqlTable) });
    else if (cube.sql) facts.push({ label: 'SQL', value: String(cube.sql) });
    if (cube.sqlAlias) facts.push({ label: 'sql_alias', value: String(cube.sqlAlias) });
    if (cube.public_ === false) facts.push({ label: 'hidden', value: 'this cube is not offered to viewers' });
    if (cube.accessFilter) facts.push({ label: 'access filter', value: String(cube.accessFilter) });
    if (cube.extends_) {
      facts.push({
        label: 'extends ' + String(cube.extends_),
        value: 'not supported yet: only this cube’s own fields are listed',
      });
    }
    return facts;
  }

  /** A join's wiring, on its folder line in "Show everything". */
  function joinWiring(j: any): string {
    const parts: string[] = [];
    if (j?.relationship) parts.push(String(j.relationship));
    if (j?.sql) parts.push('ON ' + String(j.sql));
    if (j?.parent) parts.push('through ' + String(j.parent));
    return parts.join(' · ');
  }

  // ── The rows the tree draws ─────────────────────────────────────────────────

  type Row =
    | { kind: 'folder'; key: string; id: string; label: string; icon: string; colour: string; depth: number; tip: string }
    | { kind: 'dimension' | 'measure' | 'segment'; member: any; depth: number }
    | { kind: 'hierarchy'; hierarchy: any; depth: number }
    | { kind: 'level'; hierarchy: any; index: number; name: string; depth: number }
    | { kind: 'detail'; text: string; depth: number }
    | { kind: 'extras'; extras: Array<{ label: string; value: string }>; depth: number };

  /** The main table's own fields, in the order the author wrote them, its key last (U1). */
  function mainDimensions(): any[] {
    const own = (activeCube?.dimensions || []).filter((d: any) => !tableOfDimension(d?.name));
    return [...own.filter((d: any) => !isTrue(d?.primary_key)), ...own.filter((d: any) => isTrue(d?.primary_key))];
  }

  function joinDimensions(joinName: string): any[] {
    return (activeCube?.dimensions || []).filter((d: any) => tableOfDimension(d?.name) === joinName);
  }

  function fieldRows(member: any, kind: 'dimension' | 'measure' | 'segment', depth: number): Row[] {
    const rows: Row[] = [{ kind, member, depth }];
    if (showEverything) {
      rows.push({ kind: 'detail', text: detailLine(member, kind), depth: depth + 1 });
      const extras = extrasOf(member, kind);
      if (extras.length > 0 && expandedExtras.has(kind + ':' + member.name)) {
        rows.push({ kind: 'extras', extras, depth: depth + 1 });
      }
    }
    return rows;
  }

  /**
   * One tree, drawn from one list: a folder's children are only in the list while it is open, so
   * the default view and "Show everything" are the same rows with the same ids.
   */
  function buildRows(
    cube: any,
    open: Set<string>,
    extrasOpen: Set<string>,
    everything: boolean,
    dims: Set<string>,
    meas: Set<string>,
    segs: Set<string>,
  ): Row[] {
    const rows: Row[] = [];
    if (!cube) return rows;

    if ((cube.measures || []).length > 0) {
      rows.push({
        kind: 'folder', key: 'measures', id: 'grp-measures', label: 'Measures',
        icon: 'Σ', colour: '#5cb85c', depth: 0, tip: '',
      });
      if (open.has('measures')) {
        for (const m of cube.measures) rows.push(...fieldRows(m, 'measure', 1));
      }
    }

    rows.push({
      kind: 'folder', key: 'main', id: 'grp-main',
      label: cube.title || cube.sqlTable || 'Table',
      icon: '📁', colour: '', depth: 0,
      tip: String(cube.sqlTable || cube.sql || ''),
    });
    if (open.has('main')) {
      for (const d of mainDimensions()) rows.push(...fieldRows(d, 'dimension', 1));
      for (const j of cube.joins || []) {
        const dimsOfJoin = joinDimensions(j?.name);
        if (dimsOfJoin.length === 0) continue;
        const key = 'join-' + j.name;
        rows.push({
          kind: 'folder', key, id: 'grp-join-' + slug(j.name), label: joinLabel(j),
          icon: '🔗', colour: '', depth: 1, tip: String(j?.relationship || ''),
        });
        if (everything) {
          const wiring = joinWiring(j);
          if (wiring) rows.push({ kind: 'detail', text: wiring, depth: 2 });
        }
        if (open.has(key)) {
          for (const d of dimsOfJoin) rows.push(...fieldRows(d, 'dimension', 2));
        }
      }
    }

    if ((cube.segments || []).length > 0) {
      rows.push({
        kind: 'folder', key: 'filters', id: 'grp-filters', label: 'Filters',
        icon: '🔍', colour: '#d9534f', depth: 0, tip: '',
      });
      if (open.has('filters')) {
        for (const s of cube.segments) rows.push(...fieldRows(s, 'segment', 1));
      }
    }

    if ((cube.hierarchies || []).length > 0) {
      rows.push({
        kind: 'folder', key: 'drill', id: 'grp-drill', label: 'Drill paths',
        icon: '📊', colour: '#5bc0de', depth: 0, tip: '',
      });
      if (open.has('drill')) {
        for (const h of cube.hierarchies) {
          rows.push({ kind: 'hierarchy', hierarchy: h, depth: 1 });
          levelsOf(h).forEach((name, index) => {
            rows.push({ kind: 'level', hierarchy: h, index, name, depth: 2 });
          });
        }
      }
    }

    return rows;
  }

  // The selections are arguments so that ticking a box redraws the tree.
  $: rows = buildRows(
    activeCube, expandedSections, expandedExtras, showEverything,
    selectedDimensions, selectedMeasures, selectedSegments,
  );

  $: facts = showEverything ? cubeFacts(activeCube) : [];

  onMount(async () => {
    await tick();
    const hostEl = container?.closest('rb-cube-renderer');
    if (hostEl) {
      if (!connectionId) connectionId = hostEl.getAttribute('connection-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
      if (!cubeName) cubeName = hostEl.getAttribute('cube-name') || '';
      if (!reportId) reportId = hostEl.getAttribute('report-id') || '';
      if (!componentId) componentId = hostEl.getAttribute('component-id') || '';
      if (!showHidden && hostEl.hasAttribute('show-hidden')) {
        showHidden = hostEl.getAttribute('show-hidden') !== 'false';
      }
      const cd = hostEl.getAttribute('cube-config');
      if (cd && !cubeConfig) {
        try { cubeConfig = JSON.parse(cd); } catch (e) { /* the host will push it as a prop instead */ }
      }
    }
    mounted = true;
  });

  // The host may set the two runtime props instead of the attributes, and after the first render:
  // either way the live cube starts once.
  $: if (mounted && runtime && !runtimeStarted) startRuntime();
</script>

<svelte:window on:keydown={onWindowKeydown} on:pointerdown={onWindowPointerDown} />

<div bind:this={container} id="cubePreviewContainer" class="rb-cube-root">
  {#if !activeCube && runtime}
    <!-- A published dashboard's live cube, before `/meta` has answered - or when it refused. -->
    <div class="rb-cube-empty">
      {#if runtimeError}
        <div id="cubeRuntimeError" class="rb-filter-note rb-filter-bad">{runtimeError}</div>
      {:else}
        <div class="rb-filter-note">Reading this cube…</div>
      {/if}
    </div>
  {:else if !activeCube}
    <div class="rb-cube-empty">
      <div style="text-align: center; color: color-mix(in oklab, currentColor 60%, transparent); padding: 40px 0;">
        <div style="font-size: 48px; margin-bottom: 10px;">&#x1f4e6;</div>
        <p>Write Cube DSL on the left to see a preview here</p>
      </div>
    </div>
  {:else}
    <!-- The cube picker: only when the file holds more than one cube to choose from -->
    {#if visibleCubes.length > 1}
      <div style="margin-bottom: 10px;">
        <select id="cubeSelect" class="rb-cube-select" bind:value={selectedCubeName} on:change={pickCube}>
          {#each visibleCubes as cube}
            <option value={cube.name}>{cube.name}{cube.hidden ? ' (hidden)' : ''}</option>
          {/each}
        </select>
      </div>
    {:else if visibleCubes.length === 0 && allCubes.length > 0}
      <p class="rb-cube-desc">Every cube in this file is hidden.</p>
    {/if}

    {#if activeCube.description}
      <p class="rb-cube-desc">{activeCube.description}</p>
    {/if}

    {#if facts.length > 0}
      <div class="rb-facts">
        {#each facts as fact}
          <div><span class="rb-extra-label">{fact.label}</span> {fact.value}</div>
        {/each}
      </div>
    {/if}

    <!-- The filters in force, one chip each: what is being looked at, before the tree it came from -->
    {#if filterChips.length > 0}
      <div id="cubeFilterChips" class="rb-chips">
        {#each filterChips as chip (chip.member)}
          <span id="chipFilter-{chip.member}" class="rb-chip">
            <button type="button" class="rb-chip-text" title="Change this filter"
                    on:click={() => openFilter(dimensionByName(chip.member))}>{chip.text}</button>
            <button type="button" id="btnChipRemove-{chip.member}" class="rb-chip-x"
                    title="Remove this filter" on:click={() => removeFilter(chip.member)}>×</button>
          </span>
        {/each}
      </div>
    {/if}

    <div class="rb-tree">
      {#each rows as row}
        {#if row.kind === 'folder'}
          <button type="button" id={row.id} class="rb-tree-row rb-tree-header"
                  class:rb-tree-join-header={row.key.startsWith('join-')}
                  style="padding-left: {4 + row.depth * 20}px;" title={row.tip}
                  on:click={() => toggleSection(row.key)}>
            <span class="rb-tree-arrow">{expandedSections.has(row.key) ? '▾' : '▸'}</span>
            <span class="rb-tree-folder-icon" style={row.colour ? 'color: ' + row.colour + ';' : ''}>{row.icon}</span>
            <span>{row.label}</span>
          </button>

        {:else if row.kind === 'measure'}
          {@const meas = row.member}
          {@const refused = errorOf('measure', meas.name)}
          <div id="meas-{meas.name}" class="rb-tree-row rb-tree-field" class:rb-refused={refused}
               style="padding-left: {4 + row.depth * 20}px;"
               title={tooltip('measure', meas, measureFacts(meas))}>
            <label class="rb-cube-checkbox">
              <input id="chk-meas-{meas.name}" type="checkbox" disabled={!!refused}
                checked={selectedMeasures.has(meas.name)}
                on:change={() => toggleMeasure(meas)} />
              {meas.title || meas.name}
            </label>
            {#if showEverything && extrasOf(meas, 'measure').length > 0}
              <button type="button" class="rb-more" title="settings"
                      on:click={() => toggleExtras('measure:' + meas.name)}>
                {expandedExtras.has('measure:' + meas.name) ? '▾' : '▸'}
              </button>
            {/if}
          </div>

        {:else if row.kind === 'dimension'}
          {@const dim = row.member}
          {@const refused = errorOf('dimension', dim.name)}
          <div id="dim-{dim.name}" class="rb-tree-row rb-tree-field" class:rb-refused={refused}
               style="padding-left: {4 + row.depth * 20}px;"
               title={tooltip('dimension', dim, dimensionFacts(dim))}>
            <label class="rb-cube-checkbox">
              <input id="chk-dim-{dim.name}" type="checkbox" disabled={!!refused}
                checked={isDimensionSelected(dim.name)}
                on:change={() => toggleDimension(dim)} />
              {dim.title || dim.name}
              {#if showEverything && isTrue(dim.primary_key)}<span class="rb-cube-badge">PK</span>{/if}
            </label>
            {#if dim.type === 'time' && isDimensionSelected(dim.name)}
              <select id="gran-{dim.name}" class="rb-gran-select"
                      on:change={(e) => setGranularity(dim, e.currentTarget.value)}>
                {#each GRANULARITIES as grain}
                  <option value={grain.value} selected={grain.value === granularityOf(dim.name)}>{grain.label}</option>
                {/each}
              </select>
            {/if}
            {#if isFilterable(dim)}
              <button type="button" id="btnFilter-{dim.name}" class="rb-filter-icon"
                      class:rb-filter-on={hasFilter(dim.name)}
                      title={hasFilter(dim.name)
                        ? 'Filtered by ' + chipValues(activeFilters[dim.name]) + '. Click to change it.'
                        : 'Filter this field'}
                      on:click={() => openFilter(dim)}>▽</button>
            {/if}
            {#if showEverything && extrasOf(dim, 'dimension').length > 0}
              <button type="button" class="rb-more" title="settings"
                      on:click={() => toggleExtras('dimension:' + dim.name)}>
                {expandedExtras.has('dimension:' + dim.name) ? '▾' : '▸'}
              </button>
            {/if}
          </div>

          {#if openFilterFor === dim.name}
            <!-- One popover at a time, under the row it belongs to: the controls are
                 `<rb-parameters>`'s, fed the metadata for this one dimension. -->
            <div id="cubeFilterPopover" class="rb-filter-popover" bind:this={filterPopover}
                 style="margin-left: {14 + row.depth * 20}px;">
              <div class="rb-filter-title">{dim.title || dim.name}</div>
              {#if filterParams.length > 0}
                <rb-parameters id="cubeFilterParams" bind:this={filterParamsEl}
                               parameters={filterParams}
                               on:valueChange={onFilterValues}
                               on:searchChange={onFilterSearch}></rb-parameters>
              {/if}
              {#if filterLoading}
                <div class="rb-filter-note">Reading the values…</div>
              {:else if filterError}
                <div class="rb-filter-note rb-filter-bad">{filterError}</div>
              {:else if filterKind === 'list' && filterOptions.length === 0}
                <div class="rb-filter-note">This field has no values to filter by.</div>
              {:else if filterTruncated}
                <div class="rb-filter-note">
                  The first {filterOptions.length} values. Type in the search box for the rest.
                </div>
              {/if}
              <div class="rb-filter-actions">
                <button type="button" id="btnFilterApply" class="rb-filter-apply"
                        on:click={applyFilter}>Apply</button>
                <button type="button" id="btnFilterClear" class="rb-filter-clear"
                        on:click={clearFilter}>Clear</button>
              </div>
            </div>
          {/if}

        {:else if row.kind === 'segment'}
          {@const seg = row.member}
          {@const refused = errorOf('segment', seg.name)}
          <div id="seg-{seg.name}" class="rb-tree-row rb-tree-field" class:rb-refused={refused}
               style="padding-left: {4 + row.depth * 20}px;"
               title={tooltip('segment', seg, [])}>
            <label class="rb-cube-checkbox">
              <input id="chk-seg-{seg.name}" type="checkbox" disabled={!!refused}
                checked={selectedSegments.has(seg.name)}
                on:change={() => toggleSegment(seg)} />
              {seg.title || seg.name}
            </label>
          </div>

        {:else if row.kind === 'hierarchy'}
          <div class="rb-tree-row rb-hier-row" style="padding-left: {4 + row.depth * 20}px;">
            {row.hierarchy.title || row.hierarchy.name}
            <span class="rb-hier-levels">{levelsOf(row.hierarchy).join(' → ')}</span>
          </div>

        {:else if row.kind === 'level'}
          {@const levelDim = dimensionByName(row.name)}
          {@const refused = !levelDim
            ? 'This drill path names ‘' + row.name + '’, and the cube has no such dimension.'
            : errorOf('dimension', row.name)}
          <div class="rb-tree-row rb-tree-field" class:rb-refused={refused}
               style="padding-left: {4 + row.depth * 20}px;" title={refused}>
            <label class="rb-cube-checkbox">
              <input id="chk-hier-{row.hierarchy.name}-{row.name}" type="checkbox" disabled={!!refused}
                checked={!!levelDim && isDimensionSelected(row.name)}
                on:change={() => toggleLevel(row.hierarchy, row.index)} />
              {levelDim?.title || row.name}
            </label>
          </div>

        {:else if row.kind === 'detail'}
          <div class="rb-detail" style="padding-left: {4 + row.depth * 20}px;">{row.text}</div>

        {:else if row.kind === 'extras'}
          <div class="rb-extras" style="padding-left: {4 + row.depth * 20}px;">
            {#each row.extras as extra}
              <div><span class="rb-extra-label">{extra.label}</span> {extra.value}</div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Selection summary -->
    {#if selectedDimensions.size > 0 || selectedMeasures.size > 0 || selectedSegments.size > 0}
      <p class="rb-cube-hint" style="margin-top: 8px; text-align: center;">
        {selectedDimensions.size} dimension{selectedDimensions.size !== 1 ? 's' : ''},
        {selectedMeasures.size} measure{selectedMeasures.size !== 1 ? 's' : ''}
        {#if selectedSegments.size > 0}, {selectedSegments.size} filter{selectedSegments.size !== 1 ? 's' : ''}{/if}
        selected
      </p>
    {/if}

    <!-- W2: the answer, under the tree it was asked from -->
    {#if runtime || runtimeError}
      <div id="cubeRuntimeResult" class="rb-runtime-result">
        {#if runtimeError}
          <div id="cubeRuntimeError" class="rb-filter-note rb-filter-bad">{runtimeError}</div>
        {:else if !runtime}
          <!-- The cube editor's preview has no answer of its own: only a refused hint shows here. -->
        {:else if nothingTicked}
          <div class="rb-filter-note">Tick a measure or a dimension</div>
        {:else if runtimeLoading && runtimeRows.length === 0}
          <div class="rb-filter-note">Answering…</div>
        {:else}
          {#if runtimeTruncated}
            <div id="cubeRuntimeTruncated" class="rb-filter-note">First {runtimeRows.length} rows</div>
          {/if}
          {#if resultShape === 'value'}
            <div id="cubeRuntimeValue">
              <rb-value data={runtimeRows} field={valueField} format={valueFormat}></rb-value>
            </div>
          {:else if resultShape === 'chart'}
            <rb-chart data={chartData} type="bar" height="260px"></rb-chart>
            {#if askedDimensions.length > 1}
              <div class="rb-filter-note">
                Drawn by {titleOf(askedDimensions[0])}. The fields ticked after it are in the rows,
                not in the chart.
              </div>
            {/if}
          {:else if resultShape === 'map'}
            <rb-map data={runtimeRows}></rb-map>
          {:else}
            <rb-tabulator data={runtimeRows}></rb-tabulator>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Show everything: the same tree, with the detail line and the settings -->
    <label class="rb-show-toggle">
      <input id="chk-show-everything" type="checkbox" bind:checked={showEverything} />
      Show everything
    </label>
  {/if}
</div>

<style>
  /* Viewer filters: the icon on a row, the popover under it, the chips above the tree */
  .rb-filter-icon {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0;
    padding: 0 4px;
    font-size: 12px;
  }
  .rb-tree-row:hover .rb-filter-icon,
  .rb-filter-icon:focus,
  .rb-filter-icon.rb-filter-on {
    /* A filter that is in force is never hidden: the row has to say so without being pointed at. */
    opacity: 1;
  }
  .rb-filter-icon.rb-filter-on {
    color: #d9534f;
  }
  .rb-filter-popover {
    border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
    border-radius: 4px;
    padding: 8px;
    margin-top: 2px;
    margin-bottom: 4px;
    background: color-mix(in oklab, currentColor 4%, transparent);
    max-width: 420px;
  }
  .rb-filter-title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .rb-filter-note {
    font-size: 11px;
    opacity: 0.75;
    margin-top: 6px;
  }
  .rb-filter-bad {
    color: #d9534f;
    opacity: 1;
  }
  /* W2: the answer, under the tree it was asked from */
  .rb-runtime-result {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent);
  }
  .rb-filter-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .rb-filter-apply,
  .rb-filter-clear {
    cursor: pointer;
    border-radius: 4px;
    padding: 3px 12px;
    font-size: 12px;
  }
  .rb-filter-apply {
    background: var(--rb-accent, #2171b5);
    color: var(--rb-accent-text, #fff);
    border: none;
  }
  .rb-filter-clear {
    background: none;
    color: inherit;
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
  }
  .rb-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .rb-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
    border-radius: 12px;
    background: color-mix(in oklab, currentColor 6%, transparent);
    font-size: 11px;
  }
  .rb-chip-text,
  .rb-chip-x {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px 2px 8px;
  }
  .rb-chip-x {
    padding: 2px 8px 2px 4px;
    opacity: 0.7;
  }
  .rb-chip-x:hover {
    opacity: 1;
    color: #d9534f;
  }

  .rb-cube-root {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }
  .rb-cube-select {
    width: 100%;
    padding: 6px 10px;
    color: inherit;
    background: transparent;
    border: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
    border-radius: 4px;
    font-size: 13px;
  }
  .rb-cube-desc {
    color: color-mix(in oklab, currentColor 60%, transparent);
    margin: 0 0 8px 0;
    font-size: 11px;
  }

  /* ── The field tree ── */
  .rb-tree {
    user-select: none;
  }
  .rb-tree-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px;
    border-radius: 3px;
    font-size: 12px;
  }
  .rb-tree-header {
    width: 100%;
    color: inherit;
    background: none;
    border: none;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .rb-tree-header:hover {
    background: color-mix(in oklab, currentColor 8%, transparent);
  }
  .rb-tree-join-header {
    color: inherit;
    font-weight: 700;
  }
  .rb-tree-arrow {
    width: 12px;
    text-align: center;
    font-size: 10px;
    color: color-mix(in oklab, currentColor 60%, transparent);
    flex-shrink: 0;
  }
  .rb-tree-folder-icon {
    font-size: 13px;
    flex-shrink: 0;
  }
  .rb-tree-field {
    cursor: default;
  }
  .rb-tree-field:hover {
    background: color-mix(in oklab, currentColor 6%, transparent);
  }
  .rb-gran-select {
    margin-left: 6px;
    padding: 0 2px;
    color: inherit;
    background: transparent;
    border: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
    border-radius: 3px;
    font-size: 11px;
  }
  /* A field the generator would refuse: shown, explained in its tooltip, and not tickable */
  .rb-refused {
    color: #d9534f;
    text-decoration: line-through;
  }
  .rb-hier-row {
    font-weight: 600;
  }
  .rb-hier-levels {
    color: color-mix(in oklab, currentColor 60%, transparent);
    font-size: 11px;
    margin-left: 6px;
  }

  /* ── "Show everything": the detail line and the settings ── */
  .rb-detail {
    color: color-mix(in oklab, currentColor 55%, transparent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 0 4px 2px 4px;
    word-break: break-word;
  }
  .rb-extras {
    color: color-mix(in oklab, currentColor 70%, transparent);
    font-size: 11px;
    padding: 0 4px 3px 4px;
    word-break: break-word;
  }
  .rb-facts {
    margin-bottom: 8px;
    font-size: 11px;
    color: color-mix(in oklab, currentColor 70%, transparent);
    word-break: break-word;
  }
  .rb-extra-label {
    font-weight: 600;
  }
  .rb-more {
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 10px;
    padding: 0 3px;
  }

  /* ── Shared ── */
  .rb-cube-checkbox {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
  .rb-cube-checkbox input[type="checkbox"] {
    margin: 0;
  }
  .rb-cube-badge {
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
  }
  .rb-cube-hint {
    color: color-mix(in oklab, currentColor 60%, transparent);
    font-size: 11px;
    margin-top: 5px;
  }
  .rb-show-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 4px 0;
    font-size: 11px;
    color: color-mix(in oklab, currentColor 60%, transparent);
    cursor: pointer;
    border-top: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
  }
  .rb-show-toggle input[type="checkbox"] {
    margin: 0;
  }
</style>

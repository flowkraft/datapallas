<svelte:options customElement={{ tag: "rb-cube-renderer", shadow: "none" }} />

<script lang="ts">
  /**
   * The cube's field tree: what a person ticks to ask a question of a cube.
   *
   * One tree, two levels of detail. The default view shows only what is ticked or chosen
   * (the design's tier 1), most needed first: Measures, then the main table with its joined
   * tables collapsed, then Filters and Drill paths. "Field details" is the same tree with the
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
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  // One formatter for every host: the table, the single value, the chart and the time labels all
  // show a number the way the cube declares it (W4.2), so two hosts cannot disagree about it.
  import { formatCell, formatMeasure, DEFAULT_CURRENCY } from '../shared/cube-format';
  import { refusalMessage, withCsrfHeader } from '../shared/session-request';

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
  /**
   * W4.8, author mode: the saved cube this tree is of. The component loads the cube and its parsed
   * fields by itself (`/api/cubes/{id}` and parse-dsl) instead of being handed a `cubeConfig`, and
   * asks `/api/cubes/{id}/query` for the rows with an author's own credential.
   *
   * A viewer never has one: a dashboard's live cube is `report-id` + `component-id`, where the
   * widget file says which cube may be asked about and the token unlocks only that report.
   */
  export let cubeId: string = '';
  /**
   * `default-fields="Revenue,CategoryName"`: the fields ticked at the start, in every mode, in
   * place of the ticks a saved selection makes - never in place of its filters. A name the cube
   * does not offer is ignored, and said so in the console, so the rest of the list still works.
   */
  export let defaultFields: string = '';
  /**
   * The answer without the asking: no field tree, no filter icons, no grain selects, and the chips
   * without their ×. What is being looked at is still said; only changing it is taken away.
   */
  export let readOnly: boolean = false;
  /**
   * What the host wants the answer drawn as: `value`, `chart`, or `table` for the plain rows. It
   * is what the widget file says for a dashboard's live cube, and what the widget type says on the
   * canvas, so the author sees the shape a viewer will get. A live cube's own `/meta` wins over it,
   * and an empty one leaves the shape to the selection, as it has always been.
   */
  export let display: string = '';
  /**
   * R8: what the viewer answered the dashboard's filter bar with, as `rb-parameters` hands it to
   * every other widget on the page - `report-params='{"country":"Germany"}'`.
   *
   * It is sent with every question this cube asks, and the server decides what it filters, out of
   * the bindings the widget's own entry declares. A value nothing is bound to changes nothing, and
   * `*` - what All travels as - is no filter at all.
   */
  export let reportParams: any = null;
  /**
   * R3: the view this widget was showing a moment ago, carried across the replacement
   * `rb-parameters` does when the viewer hits Reload.
   *
   * The whole page is rebuilt from fresh elements then, and without this the cube would come back
   * on the view the server last *saved* - which is the one from before the last few ticks, because
   * saving is debounced. The ticks a person made are not a dashboard parameter and must survive
   * the parameter being changed.
   */
  export let localState: string = '';

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
    /** A list that leaves its values out (`notIn`) instead of keeping them: the chip says `not`. */
    negate?: boolean;
  }

  /** One entry per filtered dimension. This is the whole filter state; the chips are drawn from it. */
  let activeFilters: Record<string, FilterState> = {};
  /**
   * Filters a saved widget carries that the tree has no control for (an exclusive end such as
   * `lt ${dateTo__next_day}`). They are not drawn, but they are part of the query, so they are
   * kept and sent again with every selection instead of being dropped by the first tick.
   */
  let heldFilters: Array<{ member: string; operator: string; values: string[] }> = [];
  const DRAWN_OPERATORS = ['in', 'notIn', 'equals', 'notEquals', 'between', 'gte', 'lte'];
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
      heldFilters = [];
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
    heldFilters = [];
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
    // A named filter is ticked in its own folder: a story that ticks one shows it ticked.
    if (selectedSegments.size > 0 && !expandedSections.has('filters')) {
      expandedSections.add('filters');
      changed = true;
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

  /**
   * What one asked-for dimension is: its name, and the key it is ticked under - `Country`, or
   * `OrderDate.month` when a grain was named, or the grain a tick gives a date. The key is `''`
   * when this cube has no such dimension, and both are `''` when nothing was asked for; what that
   * means is left to each caller.
   */
  function askedDimension(entry: any, grains: Record<string, string>): { name: string; key: string } {
    const said = typeof entry === 'string' ? entry : String(entry?.name ?? '');
    const dot = said.indexOf('.');
    const name = dot > 0 ? said.slice(0, dot) : said;
    if (!name) return { name: '', key: '' };
    const dim = dimensionByName(name);
    if (!dim) return { name, key: '' };
    const grain = dot > 0
      ? said.slice(dot + 1)
      : String((entry && typeof entry === 'object' ? entry.granularity : '') ?? '') || grains[name] || '';
    return { name, key: grain ? name + '.' + grain : defaultKeyOf(dim) };
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
    if (filterKind === 'list' && activeFilters[dim.name]?.negate) state.negate = true;
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
      if (f.values.length > 0) {
        out.push({ member, operator: f.negate ? 'notIn' : 'in', values: [...f.values] });
      }
    }
    for (const h of heldFilters) out.push({ member: h.member, operator: h.operator, values: [...h.values] });
    return out;
  }

  /** What one chip says after its title: the labels, or the range, and how many were left out. */
  function chipValues(f: FilterState): string {
    if (f.kind === 'date-range' || f.kind === 'number-range') {
      if (f.from && f.to) return f.from + ' \u2192 ' + f.to;
      return f.from ? '\u2265 ' + f.from : '\u2264 ' + f.to;
    }
    const shown = f.labels.length === f.values.length ? f.labels : f.values;
    const said = shown.length > 3 ? shown.slice(0, 2).join(', ') + ' +' + (shown.length - 2) : shown.join(', ');
    return f.negate ? 'not ' + said : said;
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
    const held: Array<{ member: string; operator: string; values: string[] }> = [];
    for (const f of Array.isArray(list) ? list : []) {
      const member = String(f?.member ?? '');
      const dim = member ? dimensionByName(member) : null;
      if (!dim) continue;
      const values = (Array.isArray(f?.values) ? f.values : [f?.values])
        .filter((v: any) => v !== null && v !== undefined && v !== '')
        .map((v: any) => String(v));
      const operator = String(f?.operator ?? 'in');
      if (!DRAWN_OPERATORS.includes(operator)) {
        held.push({ member, operator, values });
        continue;
      }
      const state = next[member] || { kind: controlOf(dim), values: [], labels: [], from: '', to: '' };
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
        // `notIn` (and a single `notEquals`) leaves its values out: that is kept, not turned into `in`.
        state.negate = operator === 'notIn' || operator === 'notEquals';
        // Nobody has fetched this list yet, so a value is its own label until someone opens it.
        state.labels = values;
      }
      next[member] = state;
    }
    heldFilters = held;
    return next;
  }

  $: adoptFilters(initialFilters, activeCubeSignature);

  $: filterChips = Object.keys(activeFilters).map((member) => ({
    member,
    text: titleOf(member) + ': ' + chipValues(activeFilters[member]),
  }));

  /**
   * What the dashboard's filter bar is doing to this cube, one chip per binding that has a value
   * (R8). It has no ×: it is not this widget's filter to remove, and the way to change it is the
   * filter bar the viewer set it on. A parameter answered All adds no chip, because it adds no
   * filter either.
   */
  $: dashChips = paramBindings
    .map((binding: any) => ({
      member: String(binding?.member ?? ''),
      text: titleOf(String(binding?.member ?? '')) + ': ' + dashValueText(binding),
    }))
    // A parameter nobody has answered, and All, add no chip - because they add no filter.
    .filter((chip: any) => !!chip.member && !chip.text.endsWith(': '))
    // Said where it comes from: this one is the page's filter, not a tick made here.
    .map((chip: any) => ({ ...chip, text: chip.text + ' (dashboard)' }));

  /** A binding's value as the chip says it: both ends of a `between`, or the one answer. */
  function dashValueText(binding: any): string {
    const from = dashValue(binding?.param);
    if (String(binding?.operator ?? '') === 'between') {
      const to = dashValue(binding?.paramTo);
      if (!from && !to) return '';
      return from && to ? from + ' \u2192 ' + to : (from ? '\u2265 ' + from : '\u2264 ' + to);
    }
    return from;
  }

  /** One answered value, or '' for All and for nothing - neither of which filters anything. */
  function dashValue(param: any): string {
    const value = dashboardParams[String(param ?? '')];
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    return text.trim() === '*' ? '' : text.trim();
  }

  /** Esc closes the popover, and so does a click anywhere outside it: neither applies anything. */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openFilterFor) closeFilter();
    else if (event.key === 'Escape' && drillOpen) closeDrill();
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
      // The names the docs promise a host (W4.8), next to the `selected*` keys every host already
      // reads: the same selection, under both spellings, so no host has to be changed for it.
      dimensions: [...selectedDimensions].map((key) => dimensionNameOf(key)),
      measures: [...selectedMeasures],
      segments: [...selectedSegments],
      filters: filtersOf(),
    });
    // W2: the change the host is told about is the change the live cube answers.
    scheduleQuery();
  }

  // ── W4.8: the fields a host asks for by name ────────────────────────────────

  /** `default-fields` is applied once: the cube it names has to be there to be ticked in. */
  let defaultsApplied = false;

  /**
   * The fields `default-fields` names, ticked as a click would tick them: a measure by its name, a
   * dimension at its default grain. They replace the ticks a saved selection made, and leave its
   * filters alone. A name this cube does not offer is ignored and said so in the console, so a
   * host that mistyped one is told and the rest of its list still works.
   */
  function applyDefaultFields() {
    if (defaultsApplied || !defaultFields || !activeCube) return;
    defaultsApplied = true;
    const wanted = defaultFields.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
    if (wanted.length === 0) return;
    selectedDimensions = new Set();
    selectedMeasures = new Set();
    for (const name of wanted) {
      const dim = dimensionByName(name);
      if (dim) {
        selectedDimensions.add(defaultKeyOf(dim));
      } else if (measureByName(name)) {
        selectedMeasures.add(name);
      } else {
        console.warn('rb-cube-renderer: default-fields names "' + name
          + '", which this cube does not offer');
      }
    }
    selectedDimensions = new Set(selectedDimensions);
    selectedMeasures = new Set(selectedMeasures);
    openFoldersOfSelection();
    dispatchSelection();
  }

  // ── W2: the live cube of a published dashboard ───────────────────────

  /** Both runtime props set: this tree is a dashboard's live cube, not the cube editor's preview. */
  $: runtime = !!reportId && !!componentId;

  /** A cube id and no dashboard: author mode (W4.8), the same tree on the author's own endpoints. */
  $: author = !!cubeId && !runtime;

  /** Either mode asks a server for rows; the cube editor's preview asks nothing. */
  $: live = runtime || author;

  /**
   * The shapes this widget offers, as `/meta`'s `display` list gives them, and the one being
   * drawn. One shape is a widget with nothing to choose; two or more are the Table | Chart switch,
   * and the first of them is what the card opens on (design part 8).
   */
  let displayShapes: string[] = [];
  let chosenShape = '';
  let runtimeRows: any[] = [];
  /** W4.3: one number per measure over all the rows the filters leave, or `null` if none was asked. */
  let runtimeTotals: Record<string, any> | null = null;
  let runtimeTruncated = false;
  /** A refusal or a failure, in words: it is shown where the answer would be, and never swallowed. */
  let runtimeError = '';
  let runtimeLoading = false;
  let runtimeStarted = false;
  let mounted = false;

  /** What a hint can ask for and no tick box can: the order, and how many rows. */
  let selectedOrder: Array<{ member: string; dir: string }> = [];
  let selectedLimit: number | null = null;

  // ── Cube Stories: what the widget's author turned on (design part 8) ──────

  /** The databases Show SQL offers, as `/meta` gives them; empty unless `showSql` is on. */
  let sqlDialects: Array<{ key: string; label: string }> = [];
  /** The database the SQL is written for; every card on the page follows the last one chosen. */
  let sqlVendor = '';
  /** The database the rows really come from, which no vendor choice changes. */
  let dataVendor = '';
  let sqlOpen = false;
  let sqlText = '';
  /** The database `sqlText` was written for: a statement is never shown under another database's name. */
  let sqlTextVendor = '';
  let sqlError = '';
  let sqlLoading = false;
  /** The cube's own DSL text, only where the author turned Show Config on. */
  let cubeCode = '';
  let codeOpen = false;
  /** The questions the cube was written to answer: its hints, and each variant as one of its own. */
  let hints: any[] = [];
  /** The name a page's cards agree on, so one vendor choice moves all of them at once. */
  const SQL_VENDOR_EVENT = 'rb-cube-sql-vendor';
  /** What this card can write, and where its rows come from, for the page's own picker to show. */
  const SQL_VENDOR_OFFER = 'rb-cube-sql-vendor-offer';
  /** The picker asking for that offer again, because it mounted after this card did. */
  const SQL_VENDOR_ASK = 'rb-cube-sql-vendor-ask';

  // ── W5: my view ────────────────────────────────────────────────────────────

  /** Where this viewer's own view is kept, as `/meta` says: `account`, `browser` or `none`. */
  let viewStorage = 'none';
  /** The author's opening selection, layer 1, which "Reset view" goes back to. */
  let authorDefault: any = {};
  /** The cube panel, folded to its header line or open; part of the saved view. */
  let panelCollapsed = false;
  /** Fields a saved view named that the cube no longer offers, said once under the chips. */
  let viewDropped: string[] = [];
  /** A save that did not happen is never silent, and never in the way either. */
  let viewSaveError = '';
  let viewSaveReason = '';
  /** Nothing is saved before the first `/meta` has said what there is to save over. */
  let viewLoaded = false;
  /** What is in the store right now, so an unchanged view is not written again. */
  let savedViewSignature = '';
  /** A view is saved once the clicking stops (the design's 1 second), never on every tick. */
  const VIEW_SAVE_DEBOUNCE = 1000;
  let viewSaveTimer: any = null;

  /** Ticking three boxes is one question, not three (the design's 300 ms). */
  const QUERY_DEBOUNCE = 300;
  let queryTimer: any = null;
  /** One question in flight; a selection made while it is out is asked next, and it wins. */
  let queryRunning = false;
  let queryQueued = false;

  /** The dashboard's answers, as this widget sends them (R8); empty outside a dashboard. */
  $: dashboardParams = paramsOf(reportParams);

  /** `report-params` as either an attribute's JSON text or a host's object. */
  function paramsOf(given: any): Record<string, any> {
    if (!given) return {};
    if (typeof given === 'string') {
      try {
        const parsed = JSON.parse(given);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (e) {
        return {};
      }
    }
    return typeof given === 'object' && !Array.isArray(given) ? given : {};
  }
  /** What the widget's entry binds them to, as `/meta` reports it: the chips the viewer sees. */
  let paramBindings: any[] = [];

  /**
   * R1: the parameters this card itself asks for, as `/meta` lists them - the names its own cube's
   * conditions use, and the names this widget is bound by.
   *
   * A dashboard declares its parameters once for the whole page. Where the page draws its own
   * `<rb-parameters>` at the top, those answers arrive as `report-params` and the card must not
   * ask the same question a second time: `cardParameters` is what is left after taking those away.
   * On the Cube Stories page, which has no parameter bar, that is the whole of the card's own list
   * - which is how a statement card can ask "which customer?" while the fourteen cards around it
   * ask nothing.
   */
  let metaParameters: any[] = [];

  /** R4: the ones this share link or embed token has already answered, by the signed value. */
  let cardLocked: Record<string, any> = {};

  /** What the viewer has answered on this card, by parameter id; a locked one is never theirs. */
  let cardValues: Record<string, any> = {};

  $: cardParameters = metaParameters.filter(
    (p: any) => !Object.prototype.hasOwnProperty.call(dashboardParams, String(p?.id ?? '')));

  /**
   * The answers this card sends: its own, with the page's over them.
   *
   * The page's win because a name the page answers is not drawn on the card at all, so the only
   * way both could hold one is a value left behind by an earlier `/meta` - and the page's is the
   * live one.
   */
  $: answeredParams = { ...cardValues, ...dashboardParams };

  /** The card's form, opened on what the dashboard declared - or on what the link fixed (R4). */
  function seedCardValues(parameters: any[], locked: Record<string, any>): Record<string, any> {
    const seeded: Record<string, any> = {};
    for (const parameter of parameters) {
      const id = String(parameter?.id ?? '');
      if (!id) continue;
      seeded[id] = Object.prototype.hasOwnProperty.call(locked, id)
        ? locked[id]
        : (parameter?.defaultValue ?? '');
    }
    return seeded;
  }

  /**
   * The viewer answered one of this card's parameters: the card asks its question again.
   *
   * The locked ones are put back over whatever arrives, so that a form tampered with in the
   * browser still sends the signed value - and the server writes it over this one again anyway,
   * which is what makes the lock a lock rather than a politeness.
   */
  function onCardParams(event: any) {
    const answered = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    cardValues = { ...cardValues, ...answered, ...cardLocked };
    if (runtime) scheduleQuery();
  }

  $: nothingTicked = selectedMeasures.size === 0 && selectedDimensions.size === 0;

  /** The one credential an embedded page can carry, the same one every other rb-* component sends. */
  function runtimeHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (embedToken) headers['X-Embed-Token'] = embedToken;
    // Without a token of its own this is the browser's own session asking, and a session write
    // carries the CSRF token the server issued or the server turns it away (D4).
    return withCsrfHeader(headers);
  }

  /** `…/reports/{reportId}/cube/{componentId}/{what}`: the three runtime endpoints, and no other. */
  function runtimeUrl(what: string): string {
    return apiBaseUrl + '/reports/' + encodeURIComponent(reportId) + '/cube/'
      + encodeURIComponent(componentId) + '/' + what;
  }

  /** The credential of whoever is asking: a viewer's embed token, or an author's API key. */
  function askHeaders(): Record<string, string> {
    if (runtime) return runtimeHeaders();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    return withCsrfHeader(headers);
  }

  /** The same three questions, asked of the dashboard's cube (W2) or of the author's own (W4.8). */
  function askUrl(what: string): string {
    return runtime
      ? runtimeUrl(what)
      : apiBaseUrl + '/cubes/' + encodeURIComponent(cubeId) + '/' + what;
  }

  /** A refused answer carries `{ error }`; anything else says what it was by its status. */
  async function runtimeAnswer(response: Response, what: string): Promise<any> {
    const answer = await response.json().catch(() => null);
    if (!response.ok) {
      // The status travels with the message: the `error` event says `code` (W4.8), and a host that
      // tells a refusal from a failure apart can only do so if it is told which this was.
      const refused: any = new Error(refusalMessage(answer, response.status, what));
      refused.code = response.status;
      throw refused;
    }
    return answer;
  }

  /**
   * Everything the result area shows as a failure is also an `error` event (W4.8): a host that
   * draws its own message is told the same thing, with the HTTP status as `code`.
   */
  function reportError(e: any, fallback: string) {
    runtimeError = String(e?.message || e || fallback);
    runtimeRows = [];
    runtimeTotals = null;
    runtimeTruncated = false;
    dispatch('error', { message: runtimeError, code: Number(e?.code ?? 0) });
  }

  async function startLive() {
    runtimeStarted = true;
    // The list a filter popover offers comes from the endpoint of the very cube being shown: the
    // component still builds no URL of its own beyond the one mode it was put in.
    if (!fetchFilterOptions) fetchFilterOptions = runtimeFilterOptions;
    if (runtime) await loadRuntimeMeta();
    else await loadAuthorCube();
  }

  /**
   * Author mode loads the cube itself (W4.8): the saved file, then the parsed copy of it the tree
   * reads. It is the same tree and the same result area as a dashboard's live cube - what differs
   * is who is asking and which cube may be asked about.
   */
  async function loadAuthorCube() {
    runtimeError = '';
    try {
      const loaded = await runtimeAnswer(
        await fetch(apiBaseUrl + '/cubes/' + encodeURIComponent(cubeId), { headers: askHeaders() }),
        'This cube could not be read');
      // The cube the file keeps this id under, and the connection it was saved with: the host may
      // name both itself, and where it does not, the saved cube's own answer is the one meant.
      if (!cubeName) cubeName = String(loaded?.cubeName ?? '');
      if (!connectionId) connectionId = String(loaded?.connectionId ?? '');
      cubeConfig = await runtimeAnswer(
        await fetch(apiBaseUrl + '/cubes/parse-dsl', {
          method: 'POST',
          headers: askHeaders(),
          body: JSON.stringify({ dslCode: String(loaded?.dslCode ?? '') }),
        }), 'This cube could not be read');
      await tick();
      applyDefaultFields();
    } catch (e: any) {
      reportError(e, 'This cube could not be read.');
    }
  }

  /** The values of one dimension, through the runtime twin of the cube editor's endpoint. */
  async function runtimeFilterOptions(dimension: string, search: string): Promise<any> {
    const body: any = { dimension, search };
    if (author && currentCubeName()) body.cubeName = currentCubeName();
    if (author && connectionId) body.connectionId = connectionId;
    const response = await fetch(askUrl('filter-options'), {
      method: 'POST',
      headers: askHeaders(),
      // The values offered are the values of the dashboard as it stands: with Germany picked, the
      // categories Germany bought (R8).
      body: JSON.stringify(withDashboardParams(body)),
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
      displayShapes = shapesOf(meta?.display);
      chosenShape = displayShapes[0] ?? '';
      // The opt-ins: a key `/meta` did not send is an opt-in that is off, and its panel is then
      // never drawn at all rather than drawn empty.
      sqlDialects = dialectsOf(meta?.sqlDialects);
      dataVendor = String(meta?.dbVendor ?? '');
      sqlVendor = pageVendor() || dataVendor || (sqlDialects[0]?.key ?? '');
      cubeCode = String(meta?.code ?? '');
      hints = Array.isArray(meta?.hints) ? meta.hints : [];
      // The page's picker shows what this cube offers, whether it mounted before this card or after.
      offerSqlVendors();
      sqlOpen = false;
      codeOpen = false;
      sqlText = '';
      sqlError = '';
      paramBindings = Array.isArray(meta?.paramBindings) ? meta.paramBindings : [];
      metaParameters = Array.isArray(meta?.parameters) ? meta.parameters : [];
      cardLocked = meta?.lockedParameters && typeof meta.lockedParameters === 'object'
        ? meta.lockedParameters
        : {};
      cardValues = seedCardValues(metaParameters, cardLocked);
      cubeConfig = cubeOfMeta(meta);
      // The tree reads the new cube first: `initial` names its fields.
      await tick();
      applySelection(startingView(meta));
      applyDefaultFields();
      // What is on the screen now is what the store holds, so nothing is written back for it.
      viewLoaded = true;
      savedViewSignature = currentViewSignature;
    } catch (e: any) {
      reportError(e, 'This live cube could not be read.');
    }
  }

  /**
   * `/meta` in the shape the tree already knows. There is no `sqlTable` in it: a viewer is told
   * what the cube offers, never how it reads it. `hasFilterOptions` becomes the `filter_options`
   * the popover asks about, which is the key the editor's own copy carries, and the members marked
   * `error: true` become the `warnings` the tree already refuses a click on.
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
      warnings: warningsOf(meta),
      // The one currency the cube declares, for every `currency` format in its result (W4.2).
      currency: meta?.currency,
    };
  }

  /** What a broken field says when the parser's own words did not travel with it. */
  const BROKEN_FIELD = 'This field has an error in it, so it cannot be asked for.';

  /**
   * The warnings the tree reads, out of what `/meta` was allowed to say. Every member the server
   * marked `error: true` is one error entry, so a broken field is drawn in the error style and
   * cannot be ticked on every dashboard, opt-ins or not. Where Show Config is on, the parser's own
   * list comes too, and its words are the ones shown, because they say what is actually wrong.
   *
   * <p>A live cube is one cube, so every entry belongs to the unnamed one: `errorOf` matches on
   * `cube`, and the name a file gives a cube inside itself never reaches a viewer.
   */
  function warningsOf(meta: any): any[] {
    const all: any[] = [];
    for (const w of (Array.isArray(meta?.warnings) ? meta.warnings : [])) {
      all.push({ ...w, cube: '' });
    }
    for (const block of ['dimension', 'measure', 'segment']) {
      for (const member of (meta?.[block + 's'] ?? [])) {
        if (member?.error) {
          all.push({ cube: '', block, member: member?.name, level: 'error', message: BROKEN_FIELD });
        }
      }
    }
    return all;
  }

  /** `display` as the list of shapes it always is, whatever the widget file wrote in it. */
  function shapesOf(declared: any): string[] {
    const said = Array.isArray(declared) ? declared : (declared ? [declared] : []);
    const shapes: string[] = [];
    for (const shape of said) {
      const name = String(shape ?? '').trim();
      if (name && !shapes.includes(name)) shapes.push(name);
    }
    return shapes;
  }

  /** `/meta`'s `sqlDialects`, as the page's picker shows them: the key it sends, the name read. */
  function dialectsOf(declared: any): Array<{ key: string; label: string }> {
    if (!Array.isArray(declared)) return [];
    return declared
      .map((d: any) => ({ key: String(d?.key ?? ''), label: String(d?.label ?? d?.key ?? '') }))
      .filter((d: any) => !!d.key);
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
    // Only a table has a bottom row to put them in, so a chart and a single number cost one query
    // and not two (W4.3).
    if (wantsTotals) request.totals = true;
    if (author) {
      if (currentCubeName()) request.cubeName = currentCubeName();
      if (connectionId) request.connectionId = connectionId;
    }
    return request;
  }

  /**
   * A story's sentence, with the field names its author wrote in `**bold**` really bold.
   *
   * The text is escaped first and only `**…**` is turned into a `<strong>`, so a hints file can put
   * no markup of its own on the page: a sentence carrying `<b>` shows those characters as
   * characters. Nothing else of Markdown is rendered, and an unpaired `**` is left as it was
   * written — the reader sees the asterisks, which is what a broken sentence deserves.
   */
  function boldFieldNames(text: string): string {
    const escaped = String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  // ── Cube Stories: Show SQL, Show Config and Show Me (design part 8) ────────

  /**
   * The same request with the dashboard's values on it (R8).
   *
   * Added here and not in `runtimeRequest`, because that one is also what a view is saved as: the
   * country the viewer picked at the top of the page is the page's, not this widget's, and a view
   * that remembered it would put a stale country back on the screen tomorrow.
   */
  function withDashboardParams(request: any): any {
    if (!runtime || Object.keys(answeredParams).length === 0) return request;
    return { ...request, params: { ...answeredParams } };
  }

  /**
   * The vendor the page as a whole is on, so a card read later starts where the others are.
   *
   * The page keeps it on its own element and nowhere else: a new page load has no choice on it, so
   * the SQL starts on the database the rows really come from, however many times somebody picked
   * Oracle yesterday (D11).
   */
  function pageVendor(): string {
    return String(document.documentElement.dataset.rbCubeSqlVendor ?? '');
  }

  /**
   * What this card can write, told to the page once its cube is read.
   *
   * The card draws no picker of its own - one page, one choice, one control - but it is the card
   * that knows what there is to choose from: the dialects of its `/meta` and the database its rows
   * come from. `<rb-sql-vendor>` shows them; nothing else on the page has to know a cube exists.
   */
  function offerSqlVendors() {
    if (sqlDialects.length === 0) return;
    document.dispatchEvent(new CustomEvent(SQL_VENDOR_OFFER,
      { detail: { vendor: dataVendor, dialects: sqlDialects } }));
  }

  /** The picker mounted after this card and is asking what there is to choose from. */
  function onPageSqlVendorAsk() {
    offerSqlVendors();
  }

  /** A database by the name a reader knows it by, or its key where the cube names one we do not. */
  function vendorLabel(key: string): string {
    return sqlDialects.find((d) => d.key === key)?.label ?? key;
  }

  /** Another card's choice, or this one's echo of it: follow it, and the SQL is written again. */
  function onPageSqlVendor(event: any) {
    const vendor = String(event?.detail?.vendor ?? '');
    if (vendor && vendor !== sqlVendor) sqlVendor = vendor;
  }

  /**
   * The SQL this selection would be answered by, on the chosen database. It runs nothing and opens
   * no connection: the rows always come from `/query`, on the widget's own connection, whatever
   * vendor is chosen here.
   */
  async function loadSql() {
    if (!runtime || sqlDialects.length === 0) return;
    if (nothingTicked) {
      sqlText = '';
      sqlError = '';
      return;
    }
    sqlLoading = true;
    try {
      const request = withDashboardParams(runtimeRequest());
      const askedVendor = sqlVendor;
      if (askedVendor) request.dbVendor = askedVendor;
      const response = await fetch(runtimeUrl('sql'), {
        method: 'POST', headers: runtimeHeaders(), body: JSON.stringify(request),
      });
      const answer = await runtimeAnswer(response, 'The SQL of this question could not be written');
      sqlText = String(answer?.sql ?? '');
      sqlTextVendor = askedVendor;
      sqlError = '';
    } catch (e: any) {
      sqlText = '';
      sqlError = String(e?.message || 'The SQL of this question could not be written.');
      // A refusal is not hidden behind a closed panel: it is about the ticks, which are on screen.
      sqlOpen = true;
    } finally {
      sqlLoading = false;
    }
  }

  /**
   * The SQL always matches the ticks, open or closed, so opening the panel shows the question that
   * is on the screen and never the one before it. The vendor is in here too: choosing another
   * database writes the same question again, in that database's SQL.
   */
  $: if (mounted && runtime && sqlDialects.length > 0 && sqlVendor !== undefined
      && currentViewSignature !== undefined) {
    loadSql();
  }

  /**
   * A hint's **Show Me**: the selection a person would make by hand, made for them. It goes
   * through `applySelection`, the one 3a wrote, so a hint naming a field this cube has not got is
   * refused in words instead of half-applied, and the question is asked as a tick asks it.
   */
  function showMe(ask: any) {
    runtimeError = '';
    applySelection(ask?.query);
  }

  /**
   * The story the ticks on the left are asking, marked on the right - whatever put them there: a
   * Show Me, the view this reader saved, or the question the author published the tile with. It is
   * read from what is ticked rather than remembered from the last press, because a reader who
   * opens the page tomorrow sees the ticks and not the press. A tick of their own takes the mark
   * off by itself: the selection is theirs then, and no longer the story's.
   *
   * What is compared is what a story asks a reader to tick - the fields, and the grain a date is
   * read at. Not the filters, which the dashboard adds to every question on the page, and not the
   * order or the number of rows, which no tick box shows.
   */
  $: askedId = storyAsked(hints, selectedDimensions, selectedMeasures, activeCube);

  /** The first story asking exactly what is ticked, or `''` when none of them is. */
  function storyAsked(asks: any[], dimensionKeys: Set<string>, measureNames: Set<string>,
      _cube: any): string {
    for (const ask of asks || []) {
      const query = ask?.query;
      if (!query || typeof query !== 'object') continue;
      const grains = query.granularities && typeof query.granularities === 'object'
        ? query.granularities : {};
      const keys = listOf(query.dimensions).map((entry: any) => askedDimension(entry, grains).key);
      if (keys.some((key: string) => !key)) continue;   // a story this cube cannot ask
      const measures = listOf(query.measures)
        .map((entry: any) => (typeof entry === 'string' ? entry : String(entry?.name ?? '')));
      if (sameAsTicked(keys, dimensionKeys) && sameAsTicked(measures, measureNames)) {
        return String(ask?.id ?? '');
      }
    }
    return '';
  }

  /** Is that list of names, in whatever order, exactly what is ticked? */
  function sameAsTicked(asked: string[], ticked: Set<string>): boolean {
    const wanted = new Set(asked.filter(Boolean));
    if (wanted.size !== ticked.size) return false;
    for (const one of wanted) if (!ticked.has(one)) return false;
    return true;
  }

  /**
   * Whether this tile has stories to put beside its cube (D9). Without them - a read-only tile, or
   * a cube whose author wrote no hints - there is no second half and the field tree has the tile
   * to itself, as it always had.
   */
  $: offersStories = hints.length > 0 && !readOnly;

  /** The errors and the notes the parser left on this cube, errors first (design part 8). */
  $: shownWarnings = [...(cubeConfig?.warnings ?? [])]
    .filter((w: any) => String(w?.message ?? '') && String(w.message) !== BROKEN_FIELD)
    .sort((a: any, b: any) => (a?.level === 'error' ? 0 : 1) - (b?.level === 'error' ? 0 : 1));

  // ── W5: my view — loading it, saving it, and giving it back ─────────────────

  /**
   * Layer 1 is the dashboard the author published; layer 2 is what this viewer did to it. The
   * server has already put the two together for an account, so the first render is the viewer's
   * own view with no flash of the default in front of it. A browser-kept view is put together
   * here instead, out of the same names, because the server never sees it.
   */
  function startingView(meta: any): any {

    viewStorage = String(meta?.viewStorage ?? 'none');
    authorDefault = meta?.initial ?? {};
    viewDropped = Array.isArray(meta?.myViewDropped) ? meta.myViewDropped.map(String) : [];
    viewSaveError = '';
    panelCollapsed = false;

    // R3: the viewer changed the parameter a moment ago and `rb-parameters` rebuilt this element.
    // What they were looking at then is what they expect back, ahead of the view the server last
    // saved - which is older, because saving is debounced.
    const handedOver = handedOverView();
    if (handedOver?.selection) {
      panelCollapsed = !!handedOver.collapsed;
      const dropped: string[] = [];
      const cleaned = cleanAgainst(meta, handedOver.selection, dropped);
      viewDropped = dropped;
      if (list(cleaned.dimensions).length > 0 || list(cleaned.measures).length > 0) return cleaned;
    }

    if (viewStorage === 'account' && meta?.myView?.selection) {
      panelCollapsed = !!meta.myView.collapsed;
      return meta.myView.selection;
    }

    if (viewStorage === 'browser') {
      const saved = readBrowserView();
      if (saved?.selection) {
        const dropped: string[] = [];
        const cleaned = cleanAgainst(meta, saved.selection, dropped);
        viewDropped = dropped;
        // Nothing the cube still offers is not a view: the author's own is one that works.
        if (list(cleaned.dimensions).length > 0 || list(cleaned.measures).length > 0) {
          panelCollapsed = !!saved.collapsed;
          return cleaned;
        }
        panelCollapsed = !!saved.collapsed;
      }
    }

    return authorDefault;
  }

  /** The `local-state` this element was handed, or nothing if it was handed none. */
  function handedOverView(): any {
    if (!localState) return null;
    try {
      const parsed = JSON.parse(localState);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * The cube is edited after a view of it was saved: whatever it no longer offers goes, and is
   * named, and the rest of the view still opens. This is the same cleaning the server does for an
   * account, over the names `/meta` just sent.
   */
  function cleanAgainst(meta: any, selection: any, dropped: string[]): any {

    const offered = new Set<string>();
    for (const group of [meta?.dimensions, meta?.measures, meta?.segments]) {
      for (const member of (group ?? [])) if (member?.name) offered.add(String(member.name));
    }

    const keep = (names: any): string[] => list(names).filter((name: string) => {
      if (offered.has(name)) return true;
      dropped.push(name);
      return false;
    });

    const cleaned: any = {
      dimensions: keep(selection?.dimensions),
      measures: keep(selection?.measures),
      segments: keep(selection?.segments),
      filters: (Array.isArray(selection?.filters) ? selection.filters : []).filter((filter: any) => {
        if (offered.has(String(filter?.member))) return true;
        dropped.push(String(filter?.member));
        return false;
      }),
      granularities: {} as Record<string, string>,
    };
    for (const [name, grain] of Object.entries(selection?.granularities ?? {})) {
      if (cleaned.dimensions.includes(name)) cleaned.granularities[name] = String(grain);
    }
    if (Array.isArray(selection?.order)) {
      cleaned.order = selection.order.filter((o: any) => offered.has(String(o?.member)));
    }
    if (selection?.limit) cleaned.limit = selection.limit;
    if (selection?.totals) cleaned.totals = true;
    return cleaned;
  }

  function list(values: any): string[] {
    return Array.isArray(values) ? values.map(String) : [];
  }

  /** `rb-cube-view:<reportId>:<componentId>`: one key per widget, per browser. */
  function browserViewKey(): string {
    return 'rb-cube-view:' + reportId + ':' + componentId;
  }

  /**
   * Browser storage is the one place here that is allowed to be missing: a private window, blocked
   * site data, or a page drawn for a thumbnail. Every touch of it is guarded, and a dashboard whose
   * view could not be read is still a dashboard.
   */
  function readBrowserView(): any {
    try {
      const raw = window.localStorage.getItem(browserViewKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeBrowserView(value: any): boolean {
    try {
      window.localStorage.setItem(browserViewKey(), JSON.stringify(value));
      return true;
    } catch (e) {
      viewSaveReason = String((e as any)?.message || e || '');
      return false;
    }
  }

  function forgetBrowserView(): boolean {
    try {
      window.localStorage.removeItem(browserViewKey());
      return true;
    } catch (e) {
      viewSaveReason = String((e as any)?.message || e || '');
      return false;
    }
  }

  /** The view as it stands: the question that would be asked, plus how the panel is left. */
  function currentView(): any {
    return { v: 1, selection: runtimeRequest(), collapsed: panelCollapsed };
  }

  /**
   * Two views are the same view when they ask the same thing and are left the same way. Comparing
   * them is what tells a change worth saving from a redraw, and what tells "this is the author's
   * own view again" — which is a delete, not a save, so the viewer still gets a default the
   * author publishes later.
   *
   * The Total row is left out: whether it is asked for follows from the shape the selection
   * draws (a table has the row, a chart does not), so it is never a difference of its own. The
   * author's published selection does not carry it, and counting it made the author's own view
   * differ from itself, which saved it again right after "Reset view" had thrown it away.
   */
  function signatureOf(view: any): string {

    const selection = view?.selection ?? {};
    const grains = Object.keys(selection.granularities ?? {}).sort()
      .map((name) => name + ':' + selection.granularities[name]);
    return JSON.stringify([
      list(selection.dimensions).slice().sort(),
      list(selection.measures).slice().sort(),
      list(selection.segments).slice().sort(),
      (selection.filters ?? []).map((f: any) => [f?.member, f?.operator, list(f?.values)]),
      grains,
      (selection.order ?? []).map((o: any) => [o?.member, o?.dir]),
      selection.limit ?? null,
      !!view?.collapsed,
    ]);
  }

  /**
   * Svelte is told what this depends on by being handed it: the arguments are the state the
   * signature is built from, so ticking a box or opening the panel recomputes it (and with it the
   * Reset view link) without anything having to remember to say so.
   */
  function signatureNow(..._changes: any[]): string {
    return live ? signatureOf(currentView()) : '';
  }

  $: currentViewSignature = signatureNow(selectedDimensions, selectedMeasures, selectedSegments,
    activeFilters, selectedOrder, selectedLimit, wantsTotals, panelCollapsed, activeCube);

  $: defaultViewSignature = signatureOf({ selection: authorDefault, collapsed: false });

  /** The link shows only when there is something to go back from. */
  $: viewDiffers = runtime && viewStorage !== 'none' && viewLoaded
    && currentViewSignature !== defaultViewSignature;

  /**
   * What the panel is called: the cube's own title, never the bare word `Cube`, which named
   * neither the cube nor the panel. A cube with no title at all falls back to the name the file
   * gives it, and only a cube with neither is described by what the panel does.
   */
  $: cubeHeading = String(activeCube?.title || activeCube?.name || selectedCubeName || '').trim();

  /**
   * `Online Sales · Ship Country: Germany`, in chip order, the same text in both panel states.
   * With nothing filtering it, the line says what the panel is for instead.
   */
  $: panelHeaderText = [...dashChips, ...filterChips].length === 0
    ? (cubeHeading ? cubeHeading + ' · pick what to see' : 'Pick what to see')
    : (cubeHeading ? cubeHeading + ' · ' : '')
      + [...dashChips, ...filterChips].map((chip) => chip.text).join('; ');

  /**
   * The author's canvas keeps its selection on the widget (W3), and a read-only cube cannot be
   * changed at all, so neither saves a view. `none` is the author's own answer for this widget:
   * no layer 2 for anybody.
   */
  function scheduleViewSave() {
    if (!runtime || readOnly || !viewLoaded || viewStorage === 'none') return;
    if (viewSaveTimer) clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(saveView, VIEW_SAVE_DEBOUNCE);
  }

  async function saveView() {

    viewSaveTimer = null;
    if (!runtime || readOnly || !viewLoaded || viewStorage === 'none') return;

    const view = currentView();
    const signature = signatureOf(view);
    if (signature === savedViewSignature) return;

    // Back at what the author published: the row goes, so a default they publish tomorrow is the
    // one this viewer opens tomorrow.
    const isDefault = signature === defaultViewSignature;
    viewSaveReason = '';
    const done = isDefault ? await removeSavedView() : await putSavedView(view);

    if (done) {
      savedViewSignature = signature;
      viewSaveError = '';
    } else {
      viewSaveError = 'Your view was not saved';
    }
  }

  async function putSavedView(view: any): Promise<boolean> {

    if (viewStorage === 'browser') return writeBrowserView(view);

    try {
      const response = await fetch(runtimeUrl('my-view'), {
        method: 'PUT',
        headers: runtimeHeaders(),
        body: JSON.stringify({ selection: view.selection, collapsed: view.collapsed }),
      });
      if (!response.ok) {
        const answer = await response.json().catch(() => null);
        viewSaveReason = refusalMessage(answer, response.status, 'Your view was not saved');
        return false;
      }
      return true;
    } catch (e: any) {
      viewSaveReason = String(e?.message || e || '');
      return false;
    }
  }

  async function removeSavedView(): Promise<boolean> {

    if (viewStorage === 'browser') return forgetBrowserView();

    try {
      const response = await fetch(runtimeUrl('my-view'), {
        method: 'DELETE',
        headers: runtimeHeaders(),
      });
      if (!response.ok && response.status !== 404) {
        viewSaveReason = refusalMessage(await response.json().catch(() => null), response.status,
          'Your view was not reset');
        return false;
      }
      return true;
    } catch (e: any) {
      viewSaveReason = String(e?.message || e || '');
      return false;
    }
  }

  /**
   * Reset view: one click, no dialog. What was saved is thrown away, the author's own dashboard is
   * loaded again, and the panel is open, which is how the author published it.
   */
  async function resetView() {

    if (viewSaveTimer) {
      clearTimeout(viewSaveTimer);
      viewSaveTimer = null;
    }
    viewSaveReason = '';
    const done = await removeSavedView();
    viewSaveError = done ? '' : 'Your view was not saved';

    viewDropped = [];
    panelCollapsed = false;
    savedViewSignature = defaultViewSignature;
    applySelection(authorDefault);
  }

  /** The header is the only control there is, and in read-only it is a label rather than one. */
  function togglePanel() {
    if (readOnly) return;
    panelCollapsed = !panelCollapsed;
    // How the panel is left is part of the view, and it is left this way whether or not a query
    // follows: folding a panel asks nothing of the database.
    scheduleViewSave();
  }

  function scheduleQuery() {
    if (!live || !activeCube) return;
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
    if (!live) return;
    if (nothingTicked) {
      runtimeRows = [];
      runtimeTotals = null;
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
      const response = await fetch(askUrl('query'), {
        method: 'POST',
        headers: askHeaders(),
        body: JSON.stringify(withDashboardParams(runtimeRequest())),
      });
      const answer = await runtimeAnswer(response, 'This question could not be answered');
      if (!queryQueued) {
        runtimeRows = Array.isArray(answer?.rows) ? answer.rows : [];
        runtimeTruncated = !!answer?.truncated;
        runtimeTotals = answer?.totals ?? null;
        runtimeError = '';
        const loaded: any = {
          rows: runtimeRows,
          columns: [...askedDimensions, ...askedMeasures],
        };
        // The statement only where the person asking may see it: the author's own cube, never a
        // viewer's dashboard (W4.8).
        if (author && answer?.sql) loaded.sql = String(answer.sql);
        dispatch('dataLoaded', loaded);
        // W5: a view that answers is a view worth keeping. One that errored never gets saved.
        scheduleViewSave();
      }
    } catch (e: any) {
      if (!queryQueued) reportError(e, 'This question could not be answered.');
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
      cube: any, offersChoice: boolean): string {
    // A widget that offers a choice of shapes never answers with a single number: its viewer asked
    // for the table or the chart, and one measure ticked is a table of one row (design part 8).
    if (display === 'value'
        || (!offersChoice && rows.length === 1 && measures.size === 1 && dimensions.size === 0)) {
      return 'value';
    }
    if (display === 'chart' && dimensions.size >= 1 && measures.size >= 1) return 'chart';
    if (geoTicked(dimensions, cube)) return 'map';
    return 'table';
  }

  /**
   * Whether the ticks make a shape a chart can draw: one dimension along the bottom and at least
   * one measure up the side. Two dimensions are rows, not a chart, and a geo one is the map's.
   */
  function chartable(dimensions: Set<string>, measures: Set<string>, cube: any): boolean {
    if (measures.size < 1 || dimensions.size !== 1) return false;
    const name = dimensionNameOf([...dimensions][0]);
    return (cube?.dimensions || []).find((d: any) => d?.name === name)?.type !== 'geo';
  }

  /** More than one shape offered: the viewer chooses, and the switch is drawn. */
  $: offersShapeChoice = displayShapes.length > 1;

  $: chartFits = chartable(selectedDimensions, selectedMeasures, activeCube);

  /**
   * The host's wish, and over it the shape a live cube's own file offers. Where the file offers
   * several, the viewer's own choice decides, and a selection no chart can draw falls back to the
   * table rather than leaving the card empty.
   */
  $: shownDisplay = offersShapeChoice
    ? (chosenShape === 'chart' && chartFits ? 'chart' : 'table')
    : (displayShapes[0] ?? display);

  $: resultShape = shapeOf(shownDisplay, runtimeRows, selectedDimensions, selectedMeasures,
    activeCube, offersShapeChoice);

  /** A date along the bottom is a line; anything else is a bar (design part 8). */
  $: chartType = timeTicked(selectedDimensions, activeCube) ? 'line' : 'bar';

  /** Whether the one ticked dimension is a time dimension. */
  function timeTicked(dimensions: Set<string>, cube: any): boolean {
    if (dimensions.size !== 1) return false;
    const name = dimensionNameOf([...dimensions][0]);
    return (cube?.dimensions || []).find((d: any) => d?.name === name)?.type === 'time';
  }

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
      labels: rows.map((row) => formatCell(row?.[dimensions[0]], columnFormat(dimensions[0] ?? ''))),
      datasets: measures.map((name) => ({
        label: measureTitle(name),
        data: rows.map((row) => Number(row?.[name] ?? 0)),
      })),
    };
  }

  $: chartData = resultShape === 'chart'
    ? chartOf(runtimeRows, askedDimensions, askedMeasures)
    : { labels: [], datasets: [] };

  // ── W4.2: the formats the cube declares, wherever the answer is drawn ───────

  /** The currency a `currency` format is in: the cube says it once, and every host keeps it. */
  $: cubeCurrency = String(activeCube?.currency || DEFAULT_CURRENCY);

  /**
   * How one column of the answer is shown: a measure in its declared format, a ticked time
   * dimension at the grain it was asked at. A time field nobody asked a grain of - a drill's own
   * date, say - is shown as the database returned it rather than rounded to a month it never said.
   */
  function columnFormat(name: string): { format?: string; granularity?: string; currency?: string } {
    if (measureByName(name)) {
      return { format: String(measureByName(name)?.format ?? ''), currency: cubeCurrency };
    }
    const dim = dimensionByName(name);
    if (dim?.type === 'time') {
      return { granularity: isDimensionSelected(name) ? granularityOf(name) : '' };
    }
    return {};
  }

  /**
   * The answer's columns, told by the cube instead of guessed from the values, with the totals of
   * all the rows as the bottom row (W4.3). Tabulator's `bottomCalc` here adds nothing up: it
   * answers the number the server ran a second query for, which is the only right one for a
   * distinct count, an average, a ratio or a cut answer.
   */
  function columnsOf(dimensions: string[], measures: string[], totals: Record<string, any> | null): any[] {
    const columns: any[] = [];
    for (const name of dimensions) {
      const shape = columnFormat(name);
      const column: any = {
        title: titleOf(name),
        field: name,
        formatter: (cell: any) => formatCell(cell.getValue(), shape),
      };
      if (totals && columns.length === 0) column.bottomCalc = () => 'Total';
      columns.push(column);
    }
    for (const name of measures) {
      const shape = columnFormat(name);
      const column: any = {
        title: measureTitle(name),
        field: name,
        hozAlign: 'right',
        formatter: (cell: any) => formatCell(cell.getValue(), shape),
      };
      if (totals) {
        column.bottomCalc = () => formatMeasure(totals[name], String(shape.format ?? ''), cubeCurrency);
      }
      columns.push(column);
    }
    return columns;
  }

  /** Totals belong under a table, so they are asked for only where there is a row to show them in. */
  $: wantsTotals = shapeOf(shownDisplay, [], selectedDimensions, selectedMeasures, activeCube,
    offersShapeChoice) === 'table';

  $: resultColumns = columnsOf(askedDimensions, askedMeasures, runtimeTotals);

  /** The chart says its numbers in the same words as the table does (W4.2). */
  $: chartOptions = {
    scales: {
      y: {
        ticks: {
          callback: (value: any) => formatMeasure(value,
            String(measureByName(askedMeasures[0])?.format ?? ''), cubeCurrency),
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (item: any) => {
            const name = askedMeasures[Number(item?.datasetIndex ?? 0)] ?? '';
            return measureTitle(name) + ': ' + formatMeasure(item?.parsed?.y ?? item?.raw,
              String(measureByName(name)?.format ?? ''), cubeCurrency);
          },
        },
      },
    },
  };

  // ── W4.7: a ticked place is drawn on a map ──────────────────────────────────

  /** The ticked geo dimension, whose two generated columns are the point (part 2, item 2). */
  function geoOf(dimensions: Set<string>, cube: any): string {
    for (const key of dimensions) {
      const name = dimensionNameOf(key);
      if ((cube?.dimensions || []).find((d: any) => d?.name === name)?.type === 'geo') return name;
    }
    return '';
  }

  $: geoName = geoOf(selectedDimensions, activeCube);

  $: mapOptions = {
    mapType: 'pin',
    latField: geoName ? geoName + '_lat' : '',
    lonField: geoName ? geoName + '_lng' : '',
    metric: askedMeasures[0] ?? '',
  };

  // ── W4.6: the rows behind one number ────────────────────────────────────────

  let drillOpen = false;
  let drillTitle = '';
  let drillRows: any[] = [];
  let drillColumns: any[] = [];
  let drillTruncated = false;
  let drillLoading = false;
  let drillError = '';

  /**
   * The fields "the rows behind this number" shows, or none at all: a measure says so with
   * `drill_members`, and a measure read over the finished groups - a share, a running total, a
   * to-date total, a period a year back - drills by the measure it is computed from.
   */
  function drillMembersOf(name: string): string[] {
    const measure = measureByName(name);
    if (!measure) return [];
    const own = listOf(measure.drill_members).map((member: any) => String(member));
    if (own.length > 0) return own;
    if (!isTrue(measure.share_of_total) && !measure.rolling_window && !measure.time_shift) return [];
    for (const base of referencedMeasures(String(measure.sql ?? ''))) {
      const members = listOf(measureByName(base)?.drill_members).map((member: any) => String(member));
      if (members.length > 0) return members;
    }
    return [];
  }

  /** A measure without `drill_members` cannot be drilled: no pointer, no click, no modal. */
  function isDrillable(name: string): boolean {
    return live && drillMembersOf(name).length > 0;
  }

  /** Which row of the answer was clicked, as the cell the question is about: its ticked fields. */
  function cellOf(row: any): Record<string, any> {
    const cell: Record<string, any> = {};
    for (const name of askedDimensions) cell[name] = row?.[name] ?? null;
    return cell;
  }

  /** "Revenue: Ship Country Germany · Order Date Mar 2024" - the number, said in words. */
  function drillTitleOf(measure: string, cell: Record<string, any>): string {
    const parts = Object.keys(cell).map((name) =>
      titleOf(name) + ' ' + (formatCell(cell[name], columnFormat(name)) || 'not set'));
    return measureTitle(measure) + (parts.length > 0 ? ': ' + parts.join(' · ') : '');
  }

  /**
   * The rows one number is made of. The question is the same in both live modes and is the
   * server's to answer: which fields, which filters and how many rows are the cube's own say, not
   * this component's.
   */
  async function openDrill(measure: string, row: any) {
    if (!isDrillable(measure)) return;
    const cell = cellOf(row);
    drillOpen = true;
    drillError = '';
    drillLoading = true;
    drillRows = [];
    drillColumns = [];
    drillTruncated = false;
    drillTitle = drillTitleOf(measure, cell);

    const granularities: Record<string, string> = {};
    for (const key of selectedDimensions) {
      const dot = key.indexOf('.');
      if (dot > 0) granularities[key.slice(0, dot)] = key.slice(dot + 1);
    }
    const body: any = {
      measure,
      cell,
      filters: filtersOf(),
      segments: [...selectedSegments],
      granularities,
    };
    if (author) {
      if (currentCubeName()) body.cubeName = currentCubeName();
      if (connectionId) body.connectionId = connectionId;
    }

    try {
      const answer = await runtimeAnswer(await fetch(askUrl('drill'), {
        method: 'POST',
        headers: askHeaders(),
        body: JSON.stringify(withDashboardParams(body)),
      }), 'The rows behind this number could not be read');
      drillRows = Array.isArray(answer?.rows) ? answer.rows : [];
      drillTruncated = !!answer?.truncated;
      const members = drillMembersOf(measure);
      drillColumns = columnsOf(members.filter((name) => !measureByName(name)),
        members.filter((name) => !!measureByName(name)), null);
    } catch (e: any) {
      drillError = String(e?.message || e || 'The rows behind this number could not be read.');
      dispatch('error', { message: drillError, code: Number(e?.code ?? 0) });
    } finally {
      drillLoading = false;
    }
  }

  function closeDrill() {
    drillOpen = false;
  }

  /** A table cell: the field it is in says which measure, the row it is in says which cell. */
  function onCellClick(event: any) {
    const field = String(event?.detail?.field ?? '');
    if (isDrillable(field)) openDrill(field, event?.detail?.rowData ?? {});
  }

  /** A chart point: the dataset is the measure, and the point along it is the row. */
  function onChartClick(event: any) {
    const measure = askedMeasures[Number(event?.detail?.datasetIndex ?? -1)] ?? '';
    const row = runtimeRows[Number(event?.detail?.index ?? -1)];
    if (measure && row) openDrill(measure, row);
  }

  /** A point on the map: the row it was drawn from is the cell. */
  function onPointClick(event: any) {
    const measure = askedMeasures[0] ?? '';
    if (measure && event?.detail?.row) openDrill(measure, event.detail.row);
  }

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

    // A time dimension asked for without a grain gets the grain a tick gives it.
    const dimensionKeys: string[] = [];
    for (const entry of listOf(asked.dimensions)) {
      const { name, key } = askedDimension(entry, grains);
      if (!name) continue;
      if (!key || errorOf('dimension', name)) return refuseSelection('dimension', name);
      dimensionKeys.push(key);
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
      // An order names a column of the answer, and a grained dimension is one of them: the
      // `CreatedDate.day` a story groups by is sorted by as readily, as the server reads it too.
      const dot = member.indexOf('.');
      const field = dot > 0 ? member.slice(0, dot) : member;
      if (!measureByName(member) && (!dimensionByName(field) || errorOf('dimension', field))) {
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

  // ── "Field details": the detail line and the settings under the triangle ───

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

  /** The cube's own facts, shown above the tree in "Field details" (tier 3). */
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

  /** A join's wiring, on its folder line in "Field details". */
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
   * the default view and "Field details" are the same rows with the same ids.
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
      if (!cubeId) cubeId = hostEl.getAttribute('cube-id') || '';
      if (!defaultFields) defaultFields = hostEl.getAttribute('default-fields') || '';
      if (!display) display = hostEl.getAttribute('display') || '';
      if (!reportParams) reportParams = hostEl.getAttribute('report-params') || '';
      if (!localState) localState = hostEl.getAttribute('local-state') || '';
      if (!readOnly && hostEl.hasAttribute('read-only')) {
        readOnly = hostEl.getAttribute('read-only') !== 'false';
      }
      if (!showHidden && hostEl.hasAttribute('show-hidden')) {
        showHidden = hostEl.getAttribute('show-hidden') !== 'false';
      }
      const cd = hostEl.getAttribute('cube-config');
      if (cd && !cubeConfig) {
        try { cubeConfig = JSON.parse(cd); } catch (e) { /* the host will push it as a prop instead */ }
      }
    }
    // R3: how the element that replaces this one gets the view it is showing now. `rb-parameters`
    // rebuilds every widget when the viewer changes a parameter, and reads this first.
    if (hostEl) (hostEl as any).rbLocalState = () => JSON.stringify(currentView());
    mounted = true;
    // Every card of a Cube Stories page hears the page's choice of database, and answers the
    // page's picker when it asks what there is to choose from.
    document.addEventListener(SQL_VENDOR_EVENT, onPageSqlVendor);
    document.addEventListener(SQL_VENDOR_ASK, onPageSqlVendorAsk);
  });

  onDestroy(() => {
    document.removeEventListener(SQL_VENDOR_EVENT, onPageSqlVendor);
    document.removeEventListener(SQL_VENDOR_ASK, onPageSqlVendorAsk);
  });

  // The host may set the two runtime props instead of the attributes, and after the first render:
  // either way the live cube starts once.
  $: if (mounted && live && !runtimeStarted) startLive();

  // Design time has no cube to load: the host pushes one, and `default-fields` ticks in it as soon
  // as it is there.
  $: if (mounted && !live && activeCube && defaultFields && !defaultsApplied) applyDefaultFields();
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

    {#if facts.length > 0}
      <div class="rb-facts">
        {#each facts as fact}
          <div><span class="rb-extra-label">{fact.label}</span> {fact.value}</div>
        {/each}
      </div>
    {/if}

    <!-- W5: the one control the cube panel has, and what the data is filtered by, in one line -->
    {#if runtime}
      <button type="button" id="cubePanelHeader" class="rb-panel-header" class:rb-panel-fixed={readOnly}
              aria-expanded={!panelCollapsed} aria-disabled={readOnly} title={panelHeaderText}
              on:click={togglePanel}>
        <span class="rb-panel-chevron">{panelCollapsed ? '▸' : '▾'}</span>
        <span class="rb-panel-text">{panelHeaderText}</span>
      </button>
    {/if}

    <!-- What this cube is: the sentence its author wrote, under the name of the cube and at the
         size of the text around it. It used to be the smallest and faintest line on the card,
         under everything, where a reader never saw it. -->
    {#if activeCube.description}
      <p class="rb-cube-about">{activeCube.description}</p>
    {/if}

    {#if !runtime || !panelCollapsed}
    <div id="cubePanelBody">

    <!-- R1: the card's own parameters, above everything they decide. The controls are
         `<rb-parameters>`'s, the same ones a dashboard's filter bar is made of, so a locked one
         is shown the one way it is shown everywhere: the value, greyed, and what fixed it. -->
    {#if runtime && cardParameters.length > 0}
      <div id="cubeCardParamsBar" class="rb-card-params">
        <rb-parameters id="cubeCardParams"
                       parameters={cardParameters}
                       lockedParameters={cardLocked}
                       on:valueChange={onCardParams}></rb-parameters>
      </div>
    {/if}

    <!-- The filters in force, one chip each: what is being looked at, before the tree it came from -->
    {#if filterChips.length > 0 || dashChips.length > 0 || viewDiffers}
      <div class="rb-chip-bar">
      <div id="cubeFilterChips" class="rb-chips">
        <!-- R8: the dashboard's own filter, said where this widget's filters are said. No ×: it
             belongs to the filter bar at the top of the page, which is where it is changed. -->
        {#each dashChips as chip (chip.member)}
          <span id="chipDashFilter-{chip.member}" class="rb-chip rb-chip-fixed"
                title="From this dashboard's filter">
            <span class="rb-chip-text">{chip.text}</span>
          </span>
        {/each}
        {#each filterChips as chip (chip.member)}
          <span id="chipFilter-{chip.member}" class="rb-chip">
            {#if readOnly}
              <span class="rb-chip-text">{chip.text}</span>
            {:else}
              <button type="button" class="rb-chip-text" title="Change this filter"
                      on:click={() => openFilter(dimensionByName(chip.member))}>{chip.text}</button>
              <button type="button" id="btnChipRemove-{chip.member}" class="rb-chip-x"
                      title="Remove this filter" on:click={() => removeFilter(chip.member)}>×</button>
            {/if}
          </span>
        {/each}
      </div>
      {#if viewDiffers && !readOnly}
        <button type="button" id="lnkCubeResetView" class="rb-reset-view"
                title="Go back to the dashboard as it was published" on:click={resetView}>Reset view</button>
      {/if}
      </div>
    {/if}

    {#if viewDropped.length > 0}
      <div id="cubeViewDropped" class="rb-filter-note">Some saved fields no longer exist and were removed.</div>
    {/if}
    {#if viewSaveError}
      <div id="cubeViewSaveError" class="rb-filter-note rb-filter-bad"
           title={viewSaveReason}>{viewSaveError}</div>
    {/if}

    <!-- What the parser found wrong with this cube, errors first (Show Config's other half) -->
    {#if shownWarnings.length > 0}
      <div id="cubeRuntimeWarnings" class="rb-warnings">
        {#each shownWarnings as warning}
          <div class="rb-filter-note" class:rb-filter-bad={warning.level === 'error'}>
            {warning.member ? warning.member + ': ' : ''}{warning.message}
          </div>
        {/each}
      </div>
    {/if}

    <!-- D9: the cube on one half, its stories on the other, and the answer under both. A reader
         presses Show Me on the right, and the ticks on the left and the rows below both change in
         front of them instead of somewhere off the screen. The stories are written first here so
         that where the halves stack - a phone, or a tile in a narrow column - the questions are
         read before the field list. -->
    <div class="rb-cube-halves" class:rb-cube-split={offersStories}>

    <!-- The questions this cube was written to answer, each one click away (design part 8) -->
    {#if offersStories}
      <div class="rb-cube-half rb-cube-stories">
      <div id="cubeStoriesHeading" class="rb-stories-heading"
           title="Ideas for what to ask this cube: press Show Me and the fields it needs are ticked for you">Stories</div>
      <div id="cubeHints" class="rb-hints">
        {#each hints as ask (ask.id)}
          <div id="hint-{ask.id}" class="rb-hint" class:rb-hint-asked={ask.id === askedId}>
            <div class="rb-hint-question">{ask.question}</div>
            <!-- The only place this component writes HTML: what `boldFieldNames` returns is
                 escaped text with `<strong>` in it, and nothing a hints file wrote survives as markup. -->
            <div class="rb-hint-text">{@html boldFieldNames(ask.text)}</div>
            <button type="button" id="btnShowMe-{ask.id}" class="rb-hint-showme"
                    title="Tick what this question asks for" on:click={() => showMe(ask)}>Show Me</button>
          </div>
        {/each}
      </div>
      </div>
    {/if}

    <!-- read-only (W4.8): the answer without the asking - no tree, and so no icon and no grain -->
    {#if !readOnly}
    <div class="rb-cube-half rb-cube-fields">
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

    <!-- The second level of detail of the tree above, directly under the last field it adds it
         to. It used to be drawn last of all, which in a live tile put it under the answer and
         under the SQL box, far from the only thing it changes. -->
      <label class="rb-show-toggle" title="Types, settings and the cube's own facts">
        <input id="chk-show-everything" type="checkbox" bind:checked={showEverything} />
        Field details
      </label>
    </div>
    {/if}

    </div>

    <!-- Selection summary: what the two halves add up to, under both of them -->
    {#if selectedDimensions.size > 0 || selectedMeasures.size > 0 || selectedSegments.size > 0}
      <p class="rb-cube-hint" style="margin-top: 8px; text-align: center;">
        {selectedDimensions.size} dimension{selectedDimensions.size !== 1 ? 's' : ''},
        {selectedMeasures.size} measure{selectedMeasures.size !== 1 ? 's' : ''}
        {#if selectedSegments.size > 0}, {selectedSegments.size} filter{selectedSegments.size !== 1 ? 's' : ''}{/if}
        selected
      </p>
    {/if}

    </div>
    {/if}

    <!-- The shapes this widget offers, where it offers more than one (design part 8) -->
    {#if offersShapeChoice && runtime && !runtimeError}
      <div id="cubeDisplaySwitch" class="rb-display-switch">
        <button type="button" id="cubeRuntimeViewTable" class="rb-display-button"
                class:rb-display-on={shownDisplay === 'table'} aria-pressed={shownDisplay === 'table'}
                on:click={() => (chosenShape = 'table')}>Table</button>
        <button type="button" id="cubeRuntimeViewChart" class="rb-display-button"
                class:rb-display-on={shownDisplay === 'chart'} aria-pressed={shownDisplay === 'chart'}
                disabled={!chartFits} title={chartFits
                  ? 'Draw this answer as a chart'
                  : 'A chart needs one dimension and at least one measure'}
                on:click={() => (chosenShape = 'chart')}>Chart</button>
      </div>
    {/if}

    <!-- W2: the answer, under the tree it was asked from -->
    {#if runtime || runtimeError}
      <div id="cubeRuntimeResult" class="rb-runtime-result">
        {#if runtimeError}
          <div id="cubeRuntimeError" class="rb-filter-note rb-filter-bad">{runtimeError}</div>
        {/if}
        {#if runtimeError && runtimeRows.length === 0}
          <!-- A failed query empties the rows, so there is no answer to show beside its error. A refused
               selection changes nothing (refuseSelection): the answer that was drawn stays under the note. -->
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
            <!-- One number is drillable too: the wrapper is what is clicked (W4.6). A number
                 nothing can be asked about is not a button and is not reached by the keyboard. -->
            {#if isDrillable(valueField)}
              <div id="cubeRuntimeValue" class="rb-drillable" role="button" tabindex="0"
                   title="The rows behind this number"
                   on:click={() => openDrill(valueField, runtimeRows[0] ?? {})}
                   on:keydown={(e) => { if (e.key === 'Enter') openDrill(valueField, runtimeRows[0] ?? {}); }}>
                <rb-value data={runtimeRows} field={valueField} format={valueFormat}
                          currency={cubeCurrency}></rb-value>
              </div>
            {:else}
              <div id="cubeRuntimeValue">
                <rb-value data={runtimeRows} field={valueField} format={valueFormat}
                          currency={cubeCurrency}></rb-value>
              </div>
            {/if}
          {:else if resultShape === 'chart'}
            <rb-chart data={chartData} type={chartType} height="260px" options={chartOptions}
                      on:chartClick={onChartClick}></rb-chart>
            {#if askedDimensions.length > 1}
              <div class="rb-filter-note">
                Drawn by {titleOf(askedDimensions[0])}. The fields ticked after it are in the rows,
                not in the chart.
              </div>
            {/if}
          {:else if resultShape === 'map'}
            <rb-map data={runtimeRows} options={mapOptions} on:pointClick={onPointClick}></rb-map>
          {:else}
            <rb-tabulator data={runtimeRows} columns={resultColumns}
                          on:cellClick={onCellClick}></rb-tabulator>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- What the author opened up: the SQL of this question, and the cube's own DSL -->
    {#if runtime && (sqlDialects.length > 0 || cubeCode)}
      <div class="rb-opened-up">
        <!-- The cube's own definition first, then the statement this selection would be
             answered by, and each box opens in that same order. -->
        <div class="rb-opened-buttons">
          {#if cubeCode}
            <button type="button" id="cubeRuntimeViewCode" class="rb-opened-button"
                    aria-expanded={codeOpen}
                    on:click={() => (codeOpen = !codeOpen)}>{codeOpen ? 'Hide Config' : 'Show Config'}</button>
          {/if}
          {#if sqlDialects.length > 0}
            <button type="button" id="cubeRuntimeViewSql" class="rb-opened-button"
                    aria-expanded={sqlOpen}
                    on:click={() => (sqlOpen = !sqlOpen)}>{sqlOpen ? 'Hide SQL' : 'Show SQL'}</button>
          {/if}
        </div>

        {#if codeOpen && cubeCode}
          <div id="cubeRuntimeCode" class="rb-opened-panel">
            <pre class="rb-opened-text">{cubeCode}</pre>
          </div>
        {/if}

        {#if sqlOpen && sqlDialects.length > 0}
          <div id="cubeRuntimeSql" class="rb-opened-panel">
            <!-- No select here: the database is the page's choice, made once in its header by
                 `<rb-sql-vendor>`, and this line says which one this box is written for. -->
            <div class="rb-opened-head">
              <span class="rb-cube-hint">
                SQL for {vendorLabel(sqlVendor)}
                {#if dataVendor} &middot; the rows come from {vendorLabel(dataVendor)}{/if}
              </span>
            </div>
            {#if sqlError}
              <div id="cubeRuntimeSqlError" class="rb-filter-note rb-filter-bad">{sqlError}</div>
            {:else if nothingTicked}
              <div class="rb-filter-note">Tick a field to see its SQL</div>
            {:else if sqlLoading && (!sqlText || sqlTextVendor !== sqlVendor)}
              <div class="rb-filter-note">Generating&hellip;</div>
            {:else}
              <pre class="rb-opened-text">{sqlText}</pre>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

  {/if}

  <!-- W4.6: the rows behind the number that was clicked -->
  {#if drillOpen}
    <div id="cubeDrillModal" class="rb-drill-modal">
      <div class="rb-drill-head">
        <span id="cubeDrillTitle" class="rb-drill-title">{drillTitle}</span>
        <button type="button" id="btnDrillClose" class="rb-drill-close" title="Close"
                on:click={closeDrill}>×</button>
      </div>
      {#if drillError}
        <div id="cubeDrillError" class="rb-filter-note rb-filter-bad">{drillError}</div>
      {:else if drillLoading}
        <div class="rb-filter-note">Answering…</div>
      {:else}
        {#if drillTruncated}
          <div id="cubeDrillTruncated" class="rb-filter-note">First {drillRows.length} rows</div>
        {/if}
        <rb-tabulator data={drillRows} columns={drillColumns}></rb-tabulator>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Cube Stories: the hints, the shape switch, and the two panels the author opened up */
  /*
   * D9: the cube on the left half and its stories on the right, with the answer under both. The
   * halves are a grid rather than two floats so that the markup can keep the stories first, for
   * where the two stack; each is capped and scrolls on its own, so a forty-field tree cannot push
   * the answer off the screen.
   */
  .rb-cube-halves {
    display: grid;
    gap: 12px;
    align-items: start;
  }
  .rb-cube-split {
    grid-template-columns: 1fr 1fr;
  }
  .rb-cube-split .rb-cube-fields {
    grid-area: 1 / 1;
  }
  .rb-cube-split .rb-cube-stories {
    grid-area: 1 / 2;
  }
  .rb-cube-split .rb-cube-half {
    max-height: 460px;
    overflow: auto;
  }
  @media (max-width: 720px) {
    .rb-cube-split {
      grid-template-columns: 1fr;
    }
    .rb-cube-split .rb-cube-fields,
    .rb-cube-split .rb-cube-stories {
      grid-area: auto;
    }
    .rb-cube-split .rb-cube-half {
      max-height: none;
      overflow: visible;
    }
  }

  /* One word over the questions, a size above the field half's own headings: the tree is a list a
     reader scans, and this is the half they are invited to start from. */
  .rb-stories-heading {
    font-size: 15px;
    font-weight: 700;
    padding: 0 4px;
    margin: 0 0 2px;
    cursor: help;
  }

  .rb-hints {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0 8px;
  }

  .rb-hint {
    border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
    border-radius: 6px;
    padding: 8px 10px;
  }

  /* The story the ticks are asking, marked while its fields are the ticked ones. */
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

  .rb-hint-showme,
  .rb-opened-button,
  .rb-display-button {
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12px;
    padding: 3px 10px;
    cursor: pointer;
  }

  .rb-display-switch,
  .rb-opened-buttons {
    display: flex;
    gap: 6px;
    margin: 8px 0;
  }

  .rb-display-button[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .rb-display-on {
    background: color-mix(in oklab, currentColor 12%, transparent);
    font-weight: 600;
  }

  .rb-opened-panel {
    border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }

  .rb-opened-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .rb-opened-text {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* W5: the cube panel's header line - the whole line is the control */
  .rb-panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid color-mix(in oklab, currentColor 15%, transparent);
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    padding: 4px 2px;
    margin-bottom: 6px;
  }
  /* read-only: the same line, saying the same thing, with nothing to click. */
  .rb-panel-header.rb-panel-fixed {
    cursor: default;
  }
  .rb-panel-chevron {
    opacity: 0.7;
  }
  /* Too long for the width is cut here, and said in full in the tooltip. */
  .rb-panel-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rb-card-params {
    margin: 0 0 10px 0;
  }

  .rb-chip-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rb-chip-bar > .rb-chips {
    flex: 1;
    min-width: 0;
  }
  .rb-reset-view {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    opacity: 0.8;
    padding: 0;
    text-decoration: underline;
    white-space: nowrap;
  }

  /* W4.6: the rows behind one number, over the tree they were asked from */
  .rb-drill-modal {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 24px;
    z-index: 20;
    border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
    border-radius: 4px;
    padding: 8px;
    background: Canvas;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }
  .rb-drill-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .rb-drill-title {
    font-weight: 600;
    flex: 1;
  }
  .rb-drill-close {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
  }
  /* A number that has rows behind it says so before it is clicked. */
  .rb-drillable {
    cursor: pointer;
  }
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
    color: var(--color-error, #d9534f);
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
    color: var(--color-error, #d9534f);
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
    background: var(--rb-accent, var(--color-primary, #2171b5));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
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
  /* The dashboard's own filter: said like the others, but not this widget's to take off. */
  .rb-chip-fixed {
    background: var(--color-base-200, #eef2f7);
    border-style: dashed;
  }

  .rb-chip-x:hover {
    opacity: 1;
    color: var(--color-error, #d9534f);
  }

  .rb-cube-root {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    /* The drill modal is placed over this tree, not over the page it is embedded in. */
    position: relative;
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

  /* What the cube is: as readable as the field names under it (D6). `.rb-cube-desc` stays what
     it was, the class of the small notes. */
  .rb-cube-about {
    margin: 4px 0 8px 0;
    font-size: 13px;
    line-height: 1.45;
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
    color: var(--color-error, #d9534f);
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

  /* ── "Field details": the detail line and the settings ── */
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
    font-size: 12px;
    color: color-mix(in oklab, currentColor 80%, transparent);
    cursor: pointer;
    border-top: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
  }
  .rb-show-toggle input[type="checkbox"] {
    margin: 0;
  }
</style>

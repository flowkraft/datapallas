<svelte:options customElement={{ tag: "rb-cube-renderer", shadow: "none" }} />

<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';

  // Props
  export let cubeConfig: any = null;
  export let connectionId: string = '';
  export let apiBaseUrl: string = '';
  export let apiKey: string = '';

  const dispatch = createEventDispatcher();

  let container: HTMLDivElement;

  // State
  let selectedCubeName: string = '';
  let activeCube: any = null;
  let cubeNames: string[] = [];

  // Field selection
  let selectedDimensions: Set<string> = new Set();
  let selectedMeasures: Set<string> = new Set();
  let selectedSegments: Set<string> = new Set();

  // SQL modal
  let showSqlModal = false;
  let generatedSql = '';
  let sqlDialect = '';
  let sqlLoading = false;
  let sqlError = '';
  let copySuccess = false;

  // UX: tree expand/collapse, show-everything toggle
  let showEverything = false;
  let expandedSections: Set<string> = new Set();

  // Reactively update when cubeConfig changes
  $: if (cubeConfig) {
    parseCubeData(cubeConfig);
  }

  // Identity of the cube currently displayed — used to decide whether a re-bind
  // of `cubeConfig` represents a genuine cube swap (must wipe selections) or
  // just the host re-pushing the same cube content with a new object reference
  // (must preserve selections so user clicks aren't lost).
  let activeCubeSignature: string = '';

  function computeCubeSignature(data: any, cubeName: string): string {
    if (!data) return '';
    const target = (cubeName && cubeName !== '(default)' && data.namedOptions?.[cubeName])
      ? data.namedOptions[cubeName]
      : data;
    return (target.sqlTable || target.sql || '') + '|' + (cubeName || '');
  }

  function parseCubeData(data: any) {
    if (!data) {
      activeCube = null;
      cubeNames = [];
      activeCubeSignature = '';
      return;
    }

    if (data.namedOptions && Object.keys(data.namedOptions).length > 0) {
      cubeNames = Object.keys(data.namedOptions);
      if (data.sqlTable || data.sql || (data.dimensions && data.dimensions.length > 0)) {
        cubeNames = ['(default)', ...cubeNames];
      }
      if (!selectedCubeName || !cubeNames.includes(selectedCubeName)) {
        selectedCubeName = cubeNames[0];
      }
      selectCube(selectedCubeName);
    } else {
      cubeNames = [];
      selectedCubeName = '';
      activeCube = data;
    }

    const newSignature = computeCubeSignature(data, selectedCubeName);
    if (newSignature !== activeCubeSignature) {
      selectedDimensions = new Set();
      selectedMeasures = new Set();
      selectedSegments = new Set();
      activeCubeSignature = newSignature;
      initExpanded();
    }
  }

  function selectCube(name: string) {
    selectedCubeName = name;
    if (name === '(default)') {
      activeCube = cubeConfig;
    } else if (cubeConfig?.namedOptions?.[name]) {
      activeCube = cubeConfig.namedOptions[name];
    }
    selectedDimensions = new Set();
    selectedMeasures = new Set();
    selectedSegments = new Set();
    initExpanded();
  }

  function initExpanded() {
    expandedSections = new Set(['main', 'measures']);
    if (activeCube?.joins) {
      for (const j of activeCube.joins) {
        if (j.name) expandedSections.add('join-' + j.name);
      }
    }
  }

  function toggleSection(key: string) {
    if (expandedSections.has(key)) {
      expandedSections.delete(key);
    } else {
      expandedSections.add(key);
    }
    expandedSections = new Set(expandedSections);
  }

  function dispatchSelection() {
    dispatch('selectionChanged', {
      selectedDimensions: [...selectedDimensions],
      selectedMeasures: [...selectedMeasures],
      selectedSegments: [...selectedSegments],
    });
  }

  // Compute which dimensions belong to a join vs main table
  function getJoinDimensions(joinName: string): any[] {
    if (!activeCube?.dimensions) return [];
    return activeCube.dimensions.filter((dim: any) =>
      dim.sql && dim.sql.startsWith(joinName + '.')
    );
  }

  function getMainTableDimensions(): any[] {
    if (!activeCube?.dimensions) return [];
    const joinNames = (activeCube.joins || []).map((j: any) => j.name).filter(Boolean);
    return activeCube.dimensions.filter((dim: any) => {
      if (!dim.sql) return true;
      return !joinNames.some((jn: string) => dim.sql.startsWith(jn + '.'));
    });
  }

  function toggleDimension(name: string) {
    if (selectedDimensions.has(name)) {
      selectedDimensions.delete(name);
    } else {
      selectedDimensions.add(name);
    }
    selectedDimensions = new Set(selectedDimensions);
    dispatchSelection();
  }

  function toggleMeasure(name: string) {
    if (selectedMeasures.has(name)) {
      selectedMeasures.delete(name);
    } else {
      selectedMeasures.add(name);
    }
    selectedMeasures = new Set(selectedMeasures);
    dispatchSelection();
  }

  function toggleSegment(name: string) {
    if (selectedSegments.has(name)) {
      selectedSegments.delete(name);
    } else {
      selectedSegments.add(name);
    }
    selectedSegments = new Set(selectedSegments);
    dispatchSelection();
  }

  // ── SQL ──

  async function viewSql() {
    if (selectedDimensions.size === 0 && selectedMeasures.size === 0) {
      sqlError = 'Select at least one dimension or measure';
      showSqlModal = true;
      return;
    }

    sqlLoading = true;
    sqlError = '';
    generatedSql = '';
    showSqlModal = true;

    try {
      if (apiBaseUrl) {
        const cubeId = selectedCubeName && selectedCubeName !== '(default)' ? selectedCubeName : 'preview';
        const response = await fetch(`${apiBaseUrl}/cubes/${encodeURIComponent(cubeId)}/generate-sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-KEY': apiKey } : {}) },
          body: JSON.stringify({
            connectionId,
            selectedDimensions: [...selectedDimensions],
            selectedMeasures: [...selectedMeasures],
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }
        const result = await response.json();
        generatedSql = result.sql || '-- No SQL generated';
        sqlDialect = result.dialect || '';
      } else {
        generatedSql = generateClientSideSql();
      }
    } catch (err: any) {
      sqlError = err.message || 'Failed to generate SQL';
    } finally {
      sqlLoading = false;
    }
  }

  function generateClientSideSql(): string {
    if (!activeCube) return '-- No cube data';
    const table = activeCube.sqlTable || activeCube.sql_table || '?';
    const dims = [...selectedDimensions];
    const meass = [...selectedMeasures];

    const selectParts: string[] = [];
    const groupParts: string[] = [];

    for (const d of dims) {
      const dim = activeCube.dimensions?.find((x: any) => x.name === d);
      const expr = dim?.sql?.replace('${CUBE}', table) || d;
      selectParts.push(`${expr} AS "${d}"`);
      groupParts.push(expr);
    }
    for (const m of meass) {
      const meas = activeCube.measures?.find((x: any) => x.name === m);
      const type = (meas?.type || 'count').toLowerCase();
      const expr = meas?.sql?.replace('${CUBE}', table) || m;
      const agg = type === 'count' ? `COUNT(${expr})` : `${type.toUpperCase()}(${expr})`;
      selectParts.push(`${agg} AS "${m}"`);
    }

    if (selectParts.length === 0) return '-- No fields selected';

    let sql = `SELECT\n  ${selectParts.join(',\n  ')}\nFROM ${table}`;
    if (groupParts.length > 0) {
      sql += `\nGROUP BY\n  ${groupParts.join(',\n  ')}`;
      sql += `\nORDER BY\n  ${groupParts[0]}`;
    }
    return sql;
  }

  async function copySqlToClipboard() {
    try {
      await navigator.clipboard.writeText(generatedSql);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = generatedSql;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    }
  }

  function closeSqlModal() {
    showSqlModal = false;
  }

  onMount(async () => {
    await tick();
    const hostEl = container?.closest('rb-cube-renderer');
    if (hostEl) {
      if (!connectionId) connectionId = hostEl.getAttribute('connection-id') || '';
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute('api-base-url') || '';
      if (!apiKey) apiKey = hostEl.getAttribute('api-key') || '';
      const cd = hostEl.getAttribute('cube-config');
      if (cd && !cubeConfig) {
        try { cubeConfig = JSON.parse(cd); } catch(e) {}
      }
    }
  });
</script>

<div bind:this={container} id="cubePreviewContainer" class="rb-cube-root">
  {#if !activeCube}
    <div class="rb-cube-empty">
      <div style="text-align: center; color: color-mix(in oklab, currentColor 60%, transparent); padding: 40px 0;">
        <div style="font-size: 48px; margin-bottom: 10px;">&#x1f4e6;</div>
        <p>Write Cube DSL on the left to see a preview here</p>
      </div>
    </div>
  {:else}
    <!-- Cube selector (multi-cube only) -->
    {#if cubeNames.length > 1}
      <div style="margin-bottom: 10px;">
        <select class="rb-cube-select" bind:value={selectedCubeName} on:change={() => selectCube(selectedCubeName)}>
          {#each cubeNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if !showEverything}
      <!-- ════════════════════════════════════════════════════════ -->
      <!-- CLEAN VIEW: File explorer style                         -->
      <!-- ════════════════════════════════════════════════════════ -->

      <!-- Description only (the title is shown by the yellow folder header below) -->
      {#if activeCube.description}
        <p class="rb-cube-desc">{activeCube.description}</p>
      {/if}

      <div class="rb-tree">

        <!-- Main table folder -->
        <div class="rb-tree-row rb-tree-header" on:click={() => toggleSection('main')}>
          <span class="rb-tree-arrow">{expandedSections.has('main') ? '\u25BE' : '\u25B8'}</span>
          <span class="rb-tree-folder-icon">&#x1f4c1;</span>
          <span title={activeCube.sqlTable || activeCube.sql_table || ''}>
            {activeCube.title || activeCube.sqlTable || activeCube.sql_table || 'Table'}
          </span>
        </div>

        {#if expandedSections.has('main')}
          <div class="rb-tree-children">
            <!-- Main table dimensions -->
            {#each getMainTableDimensions() as dim}
              <div id="dim-{dim.name}" class="rb-tree-row rb-tree-field"
                   title="{dim.description || ''}{dim.description ? '\n' : ''}{dim.name}{dim.type ? ' (' + dim.type + ')' : ''}{dim.sql ? ' \u2502 ' + dim.sql : ''}">
                <label class="rb-cube-checkbox">
                  <input id="chk-dim-{dim.name}" type="checkbox"
                    checked={selectedDimensions.has(dim.name)}
                    on:change={() => toggleDimension(dim.name)} />
                  {dim.title || dim.name}
                  {#if dim.primary_key}<span class="rb-cube-badge">PK</span>{/if}
                </label>
              </div>
            {/each}

            <!-- Joined tables nested inside main -->
            {#each (activeCube.joins || []) as j}
              {#if getJoinDimensions(j.name).length > 0}
                <div class="rb-tree-row rb-tree-header rb-tree-join-header"
                     on:click={() => toggleSection('join-' + j.name)}
                     title="{j.relationship || ''}">
                  <span class="rb-tree-arrow">{expandedSections.has('join-' + j.name) ? '\u25BE' : '\u25B8'}</span>
                  <span class="rb-tree-folder-icon">&#x1f517;</span>
                  <span>{j.name}</span>
                </div>
                {#if expandedSections.has('join-' + j.name)}
                  <div class="rb-tree-children">
                    {#each getJoinDimensions(j.name) as dim}
                      <div id="dim-{dim.name}" class="rb-tree-row rb-tree-field"
                           title="{dim.description || ''}{dim.description ? '\n' : ''}{dim.name}{dim.type ? ' (' + dim.type + ')' : ''}{dim.sql ? ' \u2502 ' + dim.sql : ''}">
                        <label class="rb-cube-checkbox">
                          <input id="chk-dim-{dim.name}" type="checkbox"
                            checked={selectedDimensions.has(dim.name)}
                            on:change={() => toggleDimension(dim.name)} />
                          {dim.title || dim.name}
                        </label>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Measures folder -->
        {#if activeCube.measures?.length > 0}
          <div class="rb-tree-row rb-tree-header" style="margin-top: 4px;"
               on:click={() => toggleSection('measures')}>
            <span class="rb-tree-arrow">{expandedSections.has('measures') ? '\u25BE' : '\u25B8'}</span>
            <span class="rb-tree-folder-icon" style="color: #5cb85c;">&#x03A3;</span>
            <span>Measures</span>
          </div>
          {#if expandedSections.has('measures')}
            <div class="rb-tree-children">
              {#each activeCube.measures as meas}
                <div id="meas-{meas.name}" class="rb-tree-row rb-tree-field"
                     title="{meas.description || ''}{meas.description ? '\n' : ''}{meas.name}{meas.type ? ' (' + meas.type + ')' : ''}{meas.sql ? ' \u2502 ' + meas.sql : ''}">
                  <label class="rb-cube-checkbox">
                    <input id="chk-meas-{meas.name}" type="checkbox"
                      checked={selectedMeasures.has(meas.name)}
                      on:change={() => toggleMeasure(meas.name)} />
                    {meas.title || meas.name}
                  </label>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- Filters (segments) — compact, only if they exist -->
        {#if activeCube.segments?.length > 0}
          <div class="rb-tree-row rb-tree-header" style="margin-top: 4px;"
               on:click={() => toggleSection('filters')}>
            <span class="rb-tree-arrow">{expandedSections.has('filters') ? '\u25BE' : '\u25B8'}</span>
            <span class="rb-tree-folder-icon" style="color: #d9534f;">&#x1F50D;</span>
            <span>Filters</span>
          </div>
          {#if expandedSections.has('filters')}
            <div class="rb-tree-children">
              {#each activeCube.segments as seg}
                <div id="seg-{seg.name}" class="rb-tree-row rb-tree-field"
                     title="{seg.description || ''}{seg.description ? '\n' : ''}{seg.name}{seg.sql ? ' (' + seg.sql + ')' : ''}">
                  <label class="rb-cube-checkbox">
                    <input type="checkbox"
                      checked={selectedSegments.has(seg.name)}
                      on:change={() => toggleSegment(seg.name)} />
                    {seg.title || seg.name}
                  </label>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

    {:else}
      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TECHNICAL VIEW: Full details (for debugging / authoring) -->
      <!-- ════════════════════════════════════════════════════════ -->

      {#if activeCube.title}
        <h4 class="rb-cube-title">{activeCube.title}</h4>
      {/if}
      {#if activeCube.description}
        <p class="rb-cube-desc">{activeCube.description}</p>
      {/if}
      {#if activeCube.sqlTable || activeCube.sql_table}
        <p class="rb-cube-table"><strong>Table:</strong> {activeCube.sqlTable || activeCube.sql_table}</p>
      {/if}

      <!-- Dimensions (main table) -->
      {#if getMainTableDimensions().length > 0}
        <div class="rb-cube-section">
          <h5 class="rb-cube-section-title" style="color: #337ab7;">
            &#x25B8; Dimensions ({getMainTableDimensions().length})
          </h5>
          <ul class="rb-cube-list">
            {#each getMainTableDimensions() as dim}
              <li class="rb-cube-item">
                <label class="rb-cube-checkbox">
                  <input type="checkbox"
                    checked={selectedDimensions.has(dim.name)}
                    on:change={() => toggleDimension(dim.name)} />
                  <span style="color: #337ab7;">&#x25A0;</span>
                  {dim.name}
                  {#if dim.type}<span class="rb-cube-meta">({dim.type})</span>{/if}
                  {#if dim.primary_key}<span class="rb-cube-badge">PK</span>{/if}
                  {#if dim.sql}<span class="rb-cube-meta">sql: {dim.sql}</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Joins with nested dimensions -->
      {#if activeCube.joins?.length > 0}
        <div class="rb-cube-section">
          <h5 class="rb-cube-section-title" style="color: #f0ad4e;">
            &#x25B8; Joins ({activeCube.joins.length})
          </h5>
          <ul class="rb-cube-list">
            {#each activeCube.joins as j}
              <li class="rb-cube-item">
                &#x1F517; {j.name}
                {#if j.relationship}<span class="rb-cube-meta">({j.relationship})</span>{/if}
                {#if j.sql}<span class="rb-cube-meta">sql: {j.sql}</span>{/if}
                {#if getJoinDimensions(j.name).length > 0}
                  <ul class="rb-cube-list" style="margin-left: 16px; margin-top: 2px;">
                    {#each getJoinDimensions(j.name) as dim}
                      <li class="rb-cube-item">
                        <label class="rb-cube-checkbox">
                          <input type="checkbox"
                            checked={selectedDimensions.has(dim.name)}
                            on:change={() => toggleDimension(dim.name)} />
                          <span style="color: #337ab7;">&#x25A0;</span>
                          {dim.name}
                          {#if dim.type}<span class="rb-cube-meta">({dim.type})</span>{/if}
                          {#if dim.sql}<span class="rb-cube-meta">sql: {dim.sql}</span>{/if}
                        </label>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Measures -->
      {#if activeCube.measures?.length > 0}
        <div class="rb-cube-section">
          <h5 class="rb-cube-section-title" style="color: #5cb85c;">
            &#x25B8; Measures ({activeCube.measures.length})
          </h5>
          <ul class="rb-cube-list">
            {#each activeCube.measures as meas}
              <li class="rb-cube-item">
                <label class="rb-cube-checkbox">
                  <input type="checkbox"
                    checked={selectedMeasures.has(meas.name)}
                    on:change={() => toggleMeasure(meas.name)} />
                  <span style="color: #5cb85c;">&#x25A0;</span>
                  {meas.name}
                  {#if meas.type}<span class="rb-cube-meta">({meas.type})</span>{/if}
                  {#if meas.sql}<span class="rb-cube-meta">sql: {meas.sql}</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Segments -->
      {#if activeCube.segments?.length > 0}
        <div class="rb-cube-section">
          <h5 class="rb-cube-section-title" style="color: #d9534f;">
            &#x25B8; Segments ({activeCube.segments.length})
          </h5>
          <ul class="rb-cube-list">
            {#each activeCube.segments as seg}
              <li class="rb-cube-item">
                <label class="rb-cube-checkbox">
                  <input type="checkbox"
                    checked={selectedSegments.has(seg.name)}
                    on:change={() => toggleSegment(seg.name)} />
                  <span style="color: #d9534f;">&#x1F50D;</span>
                  {seg.name}
                  {#if seg.sql}<span class="rb-cube-meta">sql: {seg.sql}</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Hierarchies -->
      {#if activeCube.hierarchies?.length > 0}
        <div class="rb-cube-section">
          <h5 class="rb-cube-section-title" style="color: #5bc0de;">
            &#x25B8; Hierarchies ({activeCube.hierarchies.length})
          </h5>
          <ul class="rb-cube-list">
            {#each activeCube.hierarchies as h}
              <li class="rb-cube-item">
                &#x1F4CA; {h.name}
                {#if h.title}<span class="rb-cube-meta">({h.title})</span>{/if}
                {#if h.levels}<span class="rb-cube-meta">&#x2192; {Array.isArray(h.levels) ? h.levels.join(' \u2192 ') : h.levels}</span>{/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}

    <!-- Selection summary -->
    {#if selectedDimensions.size > 0 || selectedMeasures.size > 0 || selectedSegments.size > 0}
      <p class="rb-cube-hint" style="margin-top: 8px; text-align: center;">
        {selectedDimensions.size} dimension{selectedDimensions.size !== 1 ? 's' : ''},
        {selectedMeasures.size} measure{selectedMeasures.size !== 1 ? 's' : ''}
        {#if selectedSegments.size > 0}, {selectedSegments.size} filter{selectedSegments.size !== 1 ? 's' : ''}{/if}
        selected
      </p>
    {/if}

    <!-- Show everything toggle -->
    <label class="rb-show-toggle">
      <input type="checkbox" bind:checked={showEverything} />
      Show everything
    </label>
  {/if}

  <!-- SQL Modal -->
  {#if showSqlModal}
    <div class="rb-cube-modal-backdrop" on:click={closeSqlModal}></div>
    <div class="rb-cube-modal">
      <div class="rb-cube-modal-header">
        <h4>Generated SQL {sqlDialect ? `(${sqlDialect})` : ''}</h4>
        <button class="rb-cube-modal-close" on:click={closeSqlModal}>&times;</button>
      </div>
      <div class="rb-cube-modal-body">
        {#if sqlLoading}
          <p style="text-align: center; padding: 20px;">Generating SQL...</p>
        {:else if sqlError}
          <p style="color: #d9534f; padding: 10px;">{sqlError}</p>
        {:else}
          <pre id="cubeRendererSqlResult" class="rb-cube-sql-code">{generatedSql}</pre>
        {/if}
      </div>
      <div class="rb-cube-modal-footer">
        <button id="btnCopyCubeRendererSql" class="rb-cube-copy-btn" on:click={copySqlToClipboard} disabled={!generatedSql || sqlLoading}>
          {copySuccess ? '\u2713 Copied!' : 'Copy SQL to Clipboard'}
        </button>
        <button id="btnCloseCubeRendererSqlModal" class="rb-cube-close-btn" on:click={closeSqlModal}>Close</button>
      </div>
    </div>
  {/if}
</div>

<style>
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
  .rb-cube-title {
    margin: 0 0 2px 0;
    font-size: 15px;
    font-weight: 600;
  }
  .rb-cube-desc {
    color: color-mix(in oklab, currentColor 60%, transparent);
    margin: 0 0 8px 0;
    font-size: 11px;
  }
  .rb-cube-table {
    font-size: 12px;
    margin-bottom: 10px;
    color: color-mix(in oklab, currentColor 60%, transparent);
  }

  /* ── File explorer tree ── */
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
    cursor: pointer;
    font-weight: 600;
    color: inherit;
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
  .rb-tree-children {
    padding-left: 20px;
  }
  .rb-tree-field {
    cursor: default;
  }
  .rb-tree-field:hover {
    background: color-mix(in oklab, currentColor 6%, transparent);
  }

  /* ── Technical view (show everything) ── */
  .rb-cube-section {
    margin-top: 8px;
  }
  .rb-cube-section-title {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 600;
  }
  .rb-cube-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0 12px;
  }
  .rb-cube-item {
    padding: 2px 0;
    font-size: 12px;
  }
  .rb-cube-meta {
    color: color-mix(in oklab, currentColor 60%, transparent);
    font-size: 11px;
    margin-left: 4px;
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
    background: var(--rb-accent, var(--color-primary));
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

  /* ── SQL Modal ── */
  .rb-cube-modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 10000;
  }
  .rb-cube-modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 700px;
    max-height: 80vh;
    color: inherit;
    background: var(--rb-surface, Canvas);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 10001;
    display: flex;
    flex-direction: column;
  }
  .rb-cube-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
  }
  .rb-cube-modal-header h4 {
    margin: 0;
    font-size: 16px;
  }
  .rb-cube-modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: color-mix(in oklab, currentColor 60%, transparent);
  }
  .rb-cube-modal-body {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }
  .rb-cube-sql-code {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 16px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    margin: 0;
  }
  .rb-cube-modal-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
    display: flex;
    justify-content: space-between;
  }
  .rb-cube-copy-btn {
    padding: 8px 20px;
    background: var(--rb-accent, var(--color-primary));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  .rb-cube-copy-btn:hover:not(:disabled) {
    filter: brightness(0.92);
  }
  .rb-cube-copy-btn:disabled {
    background: color-mix(in oklab, currentColor 18%, transparent);
    cursor: not-allowed;
  }
  .rb-cube-close-btn {
    padding: 8px 20px;
    color: inherit;
    background: var(--color-base-200, color-mix(in oklab, currentColor 8%, transparent));
    border: 1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  .rb-cube-close-btn:hover {
    background: color-mix(in oklab, currentColor 14%, transparent);
  }
</style>

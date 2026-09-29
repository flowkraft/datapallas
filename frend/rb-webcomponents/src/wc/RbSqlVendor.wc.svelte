<svelte:options customElement={{ tag: "rb-sql-vendor", shadow: "none" }} />

<script lang="ts">
  /**
   * One database picker for a whole page of cubes.
   *
   * A cube tile shows the SQL its selection would be answered by, for any of the databases
   * DataPallas writes SQL for. That choice was always the page's and never one tile's, so the
   * control is the page's too: it sits once in the page header and every tile follows it through
   * the `rb-cube-sql-vendor` event on the document, exactly as it followed another tile's select
   * before. A page of sixteen cubes asks the question once (D11).
   *
   * The list is not this component's own idea of what a database is: a cube tile offers it, out of
   * the `sqlDialects` of its `/meta`, together with the database its rows really come from.
   * Whichever mounts first says so - a tile offers as soon as it has read its cube, and this
   * picker asks on mount for the tiles that were already there - so the order a page happens to
   * render in changes nothing. A page whose tiles show no SQL offers nothing, and then there is no
   * picker on it either.
   *
   * Nothing is remembered between page loads, on purpose. A fresh page reads the SQL of the
   * database its rows come from, which is where a reader should start; a choice lives in the page
   * and is gone on the next load.
   */
  import { onMount, onDestroy } from 'svelte';

  /** The database to start on, for a page that wants one other than where its rows come from. */
  export let vendor: string = '';

  /** The name a page's cubes and this picker agree on: one choice moves all of them at once. */
  const PICK = 'rb-cube-sql-vendor';
  /** A tile saying which databases it can write, and which one its rows come from. */
  const OFFER = 'rb-cube-sql-vendor-offer';
  /** This picker asking for that offer again, for the tiles that mounted before it. */
  const ASK = 'rb-cube-sql-vendor-ask';
  /** Where the page keeps its choice, for a tile whose cube is read after it was made. */
  const KEPT_ON = 'rbCubeSqlVendor';

  let dialects: { key: string; label: string }[] = [];
  /** The database the rows come from: what the page shows until a reader asks for another. */
  let dataVendor = '';
  /** What the select shows now. */
  let chosen = '';

  /** A tile's offer: the list to show, and where to start when nobody has chosen yet. */
  function onOffer(event: any) {
    const offered = Array.isArray(event?.detail?.dialects) ? event.detail.dialects : [];
    dialects = offered
      .map((d: any) => ({ key: String(d?.key ?? ''), label: String(d?.label ?? d?.key ?? '') }))
      .filter((d: any) => d.key);
    dataVendor = String(event?.detail?.vendor ?? '');
    if (!chosen) chosen = vendor || dataVendor || (dialects[0]?.key ?? '');
  }

  /** The choice as the page holds it, whoever announced it. */
  function onPick(event: any) {
    const picked = String(event?.detail?.vendor ?? '');
    if (picked && picked !== chosen) chosen = picked;
  }

  /**
   * A reader's choice, told to the page. It is kept on the page's own element, so a tile whose cube
   * is read later starts where the others are - and a reload starts again on the rows' own database.
   */
  function pick(next: string) {
    chosen = next;
    document.documentElement.dataset[KEPT_ON] = next;
    document.dispatchEvent(new CustomEvent(PICK, { detail: { vendor: next } }));
  }

  onMount(() => {
    document.addEventListener(OFFER, onOffer);
    document.addEventListener(PICK, onPick);
    if (vendor) pick(vendor);
    // The tiles that are already on the page have offered before this picker existed.
    document.dispatchEvent(new CustomEvent(ASK));
  });

  onDestroy(() => {
    document.removeEventListener(OFFER, onOffer);
    document.removeEventListener(PICK, onPick);
  });
</script>

<!-- Nothing at all until a cube has offered its databases: a page without SQL has no picker. -->
{#if dialects.length > 0}
  <div class="rb-sql-vendor-root">
    <label class="rb-sql-vendor-label" for="cubeSqlVendor">SQL for</label>
    <select id="cubeSqlVendor" class="rb-sql-vendor-select" value={chosen}
            title="The database the SQL on this page is written for"
            on:change={(e) => pick((e.currentTarget as HTMLSelectElement).value)}>
      {#each dialects as dialect}
        <option value={dialect.key}>{dialect.label}</option>
      {/each}
    </select>
  </div>
{/if}

<style>
  .rb-sql-vendor-root {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .rb-sql-vendor-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-base-content, #64748b);
  }
  .rb-sql-vendor-select {
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--color-base-300, #cbd5e1);
    border-radius: 4px;
    background: var(--color-base-100, #ffffff);
    color: var(--color-base-content, #1e293b);
  }
</style>

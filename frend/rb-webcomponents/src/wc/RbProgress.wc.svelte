<svelte:options customElement={{ tag: "rb-progress", shadow: "none" }} />

<!--
  rb-progress — value vs goal as a horizontal bar with overflow handling.
  Pure SVG/CSS, zero deps. Mirrors Metabase's progress visualization.

  Consumer modes:
  1. Self-contained: report-id + api-base-url; fetches { progressOptions } + data.
  2. Props-pushed: el.data = [{ revenue: 73000 }], el.options = { field: "revenue", goal: 100000 }.
-->

<script context="module" lang="ts">
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
  import { onMount, afterUpdate, onDestroy, tick, createEventDispatcher } from "svelte";

  export let reportId: string = "";
  export let apiBaseUrl: string = "";
  export let apiKey: string = "";
  export let componentId: string = "";
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  export let data: Record<string, unknown>[] = [];
  export let options: {
    field?: string;
    goal?: number;
    label?: string;
    format?: "number" | "currency" | "percent";
    color?: string;
  } = {};

  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  let container: HTMLDivElement;
  let selfFetchLoading = false;
  let error: string | null = null;
  const dispatch = createEventDispatcher();

  function pickField(rows: Record<string, unknown>[], explicit: string | undefined): string {
    if (explicit) return explicit;
    if (!rows[0]) return "";
    for (const k of Object.keys(rows[0])) {
      const v = rows[0][k];
      if (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))) return k;
    }
    return Object.keys(rows[0])[0] ?? "";
  }

  function formatVal(n: number, fmt: string): string {
    if (!Number.isFinite(n)) return "—";
    switch (fmt) {
      case "currency": return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      case "percent":  return (n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
      default:         return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
  }

  function render() {
    if (!container) return;
    try {
      container.innerHTML = "";
      if (!data || data.length === 0) return;

      const field = pickField(data, options.field);
      if (!field) { container.innerHTML = '<div class="rb-progress-error">Progress needs a numeric field.</div>'; return; }

      const value = Number(data[0][field]);
      if (!Number.isFinite(value)) { container.innerHTML = '<div class="rb-progress-error">Progress value is not numeric.</div>'; return; }

      const goal = options.goal ?? 100;
      const fmt = options.format ?? "number";
      const label = options.label ?? field;
      const baseColor = options.color ?? "var(--rb-accent, var(--color-primary, #509ee3))";

      const pct = goal > 0 ? value / goal : 0;
      const filledPct = Math.max(0, Math.min(1, pct));
      const overflow = pct > 1;
      const fillColor = pct >= 1 ? "#88bf4d" : (pct >= 0.75 ? baseColor : (pct >= 0.5 ? "#f9d45c" : "#ef8c8c"));

      const root = document.createElement("div");
      root.style.cssText = "display:flex;flex-direction:column;justify-content:center;height:100%;padding:8px;font-family:inherit;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;";
      const labelEl = document.createElement("div");
      labelEl.style.cssText = "font-size:11px;color:color-mix(in oklab, currentColor 60%, transparent);";
      labelEl.textContent = label;
      const valueEl = document.createElement("div");
      valueEl.style.cssText = "font-size:14px;font-weight:600;color:inherit;";
      valueEl.textContent = `${formatVal(value, fmt)} / ${formatVal(goal, fmt)}`;
      header.appendChild(labelEl);
      header.appendChild(valueEl);
      root.appendChild(header);

      const bar = document.createElement("div");
      bar.style.cssText = "position:relative;width:100%;height:14px;background:color-mix(in oklab, currentColor 12%, transparent);border-radius:7px;overflow:hidden;";
      const fill = document.createElement("div");
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${(filledPct * 100).toFixed(1)}%;background:${fillColor};transition:width 0.3s ease;`;
      bar.appendChild(fill);
      root.appendChild(bar);

      const pctEl = document.createElement("div");
      pctEl.style.cssText = `font-size:11px;margin-top:4px;color:${overflow ? "#2e7d32" : "color-mix(in oklab, currentColor 60%, transparent)"};`;
      pctEl.textContent = `${(pct * 100).toFixed(1)}%${overflow ? " — exceeded" : ""}`;
      root.appendChild(pctEl);

      container.appendChild(root);
      dispatch("ready", { value, goal, pct });
    } catch (err: any) {
      const msg = err?.message ?? "Progress render failed";
      container.innerHTML = `<div class="rb-progress-error">${msg}</div>`;
      dispatch("renderError", { message: msg });
    }
  }

  onMount(async () => {
    await tick();
    const hostEl = container?.closest("rb-progress");
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute("report-id") || "";
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute("api-base-url") || "";
      if (!apiKey) apiKey = hostEl.getAttribute("api-key") || "";
      if (!componentId) componentId = hostEl.getAttribute("component-id") || "";
      if (!testMode) {
        const tm = hostEl.getAttribute("test-mode");
        if (tm === "true" || tm === "") testMode = true;
      }
    }
    if (width) container.style.width = String(width);
    if (height) container.style.height = String(height);

    if (reportId && apiBaseUrl) {
      selfFetchLoading = true;
      try {
        const config = await fetchConfigCached(`${apiBaseUrl}/reports/${reportId}/config`, {});
        if (componentId && config.namedProgressOptions?.[componentId]) {
          options = { ...config.namedProgressOptions[componentId], ...options };
        } else if (config.progressOptions) {
          options = { ...config.progressOptions, ...options };
        }
        const qs = new URLSearchParams(reportParams as Record<string, string>);
        if (testMode) qs.set("testMode", "true");
        if (componentId) qs.set("componentId", componentId);
        const dataUrl = qs.toString()
          ? `${apiBaseUrl}/reports/${reportId}/data?${qs.toString()}`
          : `${apiBaseUrl}/reports/${reportId}/data`;
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
        const result = await res.json();
        data = Array.isArray(result) ? result : (result?.data ?? []);
        dispatch("dataFetched", { data });
      } catch (err: any) {
        error = err?.message ?? "Self-fetch failed";
        dispatch("fetchError", { message: error });
        selfFetchLoading = false;
        return;
      }
      selfFetchLoading = false;
    }

    render();
  });

  afterUpdate(() => { render(); });

  onDestroy(() => {
    if (container) container.innerHTML = "";
  });

  export async function reload(params: Record<string, string> = {}) {
    if (reportId && apiBaseUrl) {
      const qs = new URLSearchParams({ ...reportParams, ...params } as Record<string, string>);
      if (testMode) qs.set("testMode", "true");
      if (componentId) qs.set("componentId", componentId);
      const res = await fetch(`${apiBaseUrl}/reports/${reportId}/data?${qs.toString()}`);
      if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
      const result = await res.json();
      data = Array.isArray(result) ? result : (result?.data ?? []);
    }
    render();
  }
</script>

<style>
  .rb-progress-root { width: 100%; height: 100%; position: relative; }
  .rb-progress-loading, .rb-progress-error { padding: 1rem; text-align: center; font-size: 12px; }
  .rb-progress-loading { color: #666; }
  .rb-progress-error { color: #dc3545; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; }
</style>

{#if selfFetchLoading}
  <div class="rb-progress-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading progress…</div>
{/if}
{#if error}
  <div class="rb-progress-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-progress-root"
  bind:this={container}
  id={componentId ? `widgetProgress-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
></div>

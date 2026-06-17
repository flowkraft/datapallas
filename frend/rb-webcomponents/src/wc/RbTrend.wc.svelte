<svelte:options customElement={{ tag: "rb-trend", shadow: "none" }} />

<!--
  rb-trend — KPI + Δ-vs-prior + sparkline.
  Pure SVG sparkline, zero deps.

  Consumer modes:
  1. Self-contained: report-id + api-base-url.
  2. Props-pushed: el.data = [{date: "2024-01", value: 100}, {date: "2024-02", value: 120}, ...]
                   el.options = { dateField: "date", valueField: "value", format: "currency", label: "Revenue" }
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
    dateField?: string;
    valueField?: string;
    format?: "number" | "currency" | "percent" | "raw";
    label?: string;
  } = {};

  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  let container: HTMLDivElement;
  let selfFetchLoading = false;
  let error: string | null = null;
  const dispatch = createEventDispatcher();

  function inferFields(rows: Record<string, unknown>[], opts: typeof options) {
    if (!rows[0]) return { dateField: "", valueField: "" };
    const keys = Object.keys(rows[0]);
    const dateField = opts.dateField || keys.find((k) => {
      const v = rows[0][k];
      if (v instanceof Date) return true;
      if (typeof v === "string" && /\d{4}/.test(v) && !isNaN(Date.parse(v))) return true;
      return false;
    }) || keys[0];
    const valueField = opts.valueField || keys.find((k) => {
      if (k === dateField) return false;
      const v = rows[0][k];
      return typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)));
    }) || "";
    return { dateField, valueField };
  }

  function formatVal(n: number, fmt: string): string {
    if (!Number.isFinite(n)) return "—";
    switch (fmt) {
      case "currency": return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      case "percent":  return (n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
      case "raw":      return String(n);
      default:         return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
  }

  function render() {
    if (!container) return;
    try {
      container.innerHTML = "";
      if (!data || data.length === 0) return;

      const { dateField, valueField } = inferFields(data, options);
      if (!valueField) { container.innerHTML = '<div class="rb-trend-error">Trend needs a value field.</div>'; return; }

      // Safety cap — the sparkline is decorative; rendering 10k+ polyline
      // points blocks the main thread without improving the visual. Keep
      // only the tail 1000 points when data is very long.
      const MAX_POINTS = 1000;
      const raw: number[] = data.map((r) => Number(r[valueField])).filter(Number.isFinite);
      const series: number[] = raw.length > MAX_POINTS ? raw.slice(-MAX_POINTS) : raw;
      if (series.length === 0) { container.innerHTML = '<div class="rb-trend-error">No numeric values.</div>'; return; }

      const fmt = options.format ?? "number";
      const label = options.label ?? valueField;
      const current = series[series.length - 1];
      const prior = series.length >= 2 ? series[series.length - 2] : NaN;
      const delta = Number.isFinite(prior) && prior !== 0 ? (current - prior) / Math.abs(prior) : NaN;

      const root = document.createElement("div");
      root.className = "rb-trend-inner";
      root.style.cssText = "display:flex;flex-direction:column;justify-content:center;height:100%;padding:8px;font-family:inherit;";

      const labelEl = document.createElement("div");
      labelEl.style.cssText = "font-size:11px;color:color-mix(in oklab, currentColor 60%, transparent);margin-bottom:2px;";
      labelEl.textContent = label;
      root.appendChild(labelEl);

      const valueEl = document.createElement("div");
      valueEl.style.cssText = "font-size:22px;font-weight:600;color:inherit;line-height:1.1;";
      valueEl.textContent = formatVal(current, fmt);
      root.appendChild(valueEl);

      if (Number.isFinite(delta)) {
        const deltaEl = document.createElement("div");
        const up = delta >= 0;
        deltaEl.style.cssText = `font-size:11px;font-weight:500;margin-top:2px;color:${up ? "#2e7d32" : "#c62828"};`;
        deltaEl.textContent = `${up ? "▲" : "▼"} ${(Math.abs(delta) * 100).toFixed(1)}% vs prior`;
        root.appendChild(deltaEl);
      }

      // Sparkline.
      const w = container.clientWidth || 200;
      const h = 32;
      const min = Math.min(...series);
      const max = Math.max(...series);
      const range = max - min || 1;
      const stepX = series.length > 1 ? (w - 4) / (series.length - 1) : 0;
      const points = series.map((v, i) => {
        const x = 2 + i * stepX;
        const y = h - 2 - ((v - min) / range) * (h - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.style.marginTop = "6px";

      const polyline = document.createElementNS(svgNS, "polyline");
      polyline.setAttribute("points", points);
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", Number.isFinite(delta) && delta < 0 ? "#c62828" : "#2e7d32");
      polyline.setAttribute("stroke-width", "1.5");
      polyline.setAttribute("stroke-linecap", "round");
      polyline.setAttribute("stroke-linejoin", "round");
      svg.appendChild(polyline);
      root.appendChild(svg);

      container.appendChild(root);
      dispatch("ready", { current, prior, delta });
    } catch (err: any) {
      const msg = err?.message ?? "Trend render failed";
      container.innerHTML = `<div class="rb-trend-error">${msg}</div>`;
      dispatch("renderError", { message: msg });
    }
  }

  onMount(async () => {
    await tick();
    const hostEl = container?.closest("rb-trend");
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute("report-id") || "";
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute("api-base-url") || "";
      if (!apiKey) apiKey = hostEl.getAttribute("api-key") || "";
      if (!componentId) componentId = hostEl.getAttribute("component-id") || "";
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
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
        if (componentId && config.namedTrendOptions?.[componentId]) {
          options = { ...config.namedTrendOptions[componentId], ...options };
        } else if (config.trendOptions) {
          options = { ...config.trendOptions, ...options };
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
  .rb-trend-root { width: 100%; height: 100%; position: relative; }
  .rb-trend-loading, .rb-trend-error { padding: 1rem; text-align: center; font-size: 12px; }
  .rb-trend-loading { color: #666; }
  .rb-trend-error { color: #dc3545; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; }
</style>

{#if selfFetchLoading}
  <div class="rb-trend-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading trend…</div>
{/if}
{#if error}
  <div class="rb-trend-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-trend-root"
  bind:this={container}
  id={componentId ? `widgetTrend-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
></div>

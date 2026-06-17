<svelte:options customElement={{ tag: "rb-gauge", shadow: "none" }} />

<!--
  rb-gauge — semicircle gauge with optional colored bands.
  Pure SVG, zero deps.

  Consumer modes (mirror rb-map):
  1. Self-contained: report-id + api-base-url attrs; fetches { gaugeOptions } + data.
  2. Props-pushed: el.data = [{ value: 73 }], el.options = { field: "value", min: 0, max: 100, bands: [...] }.
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

  // Default 3-band traffic-light scale.
  const DEFAULT_BANDS = [
    { to: 33,  color: "#ef8c8c" },
    { to: 66,  color: "#f9d45c" },
    { to: 100, color: "#88bf4d" },
  ];
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
    min?: number;
    max?: number;
    bands?: { to: number; color: string }[];
    label?: string;
    format?: "number" | "currency" | "percent" | "raw";
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
      case "raw":      return String(n);
      default:         return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
  }

  function render() {
    if (!container) return;
    try {
      container.innerHTML = "";
      if (!data || data.length === 0) return;

      const field = pickField(data, options.field);
      if (!field) { container.innerHTML = '<div class="rb-gauge-error">Gauge needs a numeric field.</div>'; return; }

      const value = Number(data[0][field]);
      if (!Number.isFinite(value)) { container.innerHTML = '<div class="rb-gauge-error">Gauge value is not numeric.</div>'; return; }

      const min = options.min ?? 0;
      const max = options.max ?? 100;
      const bands = (options.bands && options.bands.length > 0) ? options.bands : DEFAULT_BANDS;
      const fmt = options.format ?? "number";
      const label = options.label ?? field;

      const w = container.clientWidth || 240;
      const h = container.clientHeight || 160;
      const cx = w / 2;
      const cy = h * 0.78;
      const radius = Math.min(w * 0.42, h * 0.7);
      const arcWidth = Math.max(8, radius * 0.18);

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.style.display = "block";

      // Convert value [min,max] → angle [-π, 0] (semicircle).
      const valueToAngle = (v: number) => {
        const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
        return Math.PI * (t - 1);
      };

      // Draw band arcs.
      let prev = min;
      for (const band of bands) {
        const a0 = valueToAngle(prev);
        const a1 = valueToAngle(Math.max(prev, Math.min(max, band.to)));
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", arcPath(cx, cy, radius, a0, a1, arcWidth));
        path.setAttribute("fill", band.color);
        svg.appendChild(path);
        prev = band.to;
        if (prev >= max) break;
      }

      // Needle.
      const needleAngle = valueToAngle(value);
      const nx = cx + Math.cos(needleAngle) * (radius - arcWidth * 0.2);
      const ny = cy + Math.sin(needleAngle) * (radius - arcWidth * 0.2);
      const needle = document.createElementNS(svgNS, "line");
      needle.setAttribute("x1", String(cx));
      needle.setAttribute("y1", String(cy));
      needle.setAttribute("x2", String(nx));
      needle.setAttribute("y2", String(ny));
      needle.setAttribute("stroke", "#333");
      needle.setAttribute("stroke-width", "2.5");
      needle.setAttribute("stroke-linecap", "round");
      svg.appendChild(needle);

      const hub = document.createElementNS(svgNS, "circle");
      hub.setAttribute("cx", String(cx));
      hub.setAttribute("cy", String(cy));
      hub.setAttribute("r", "4");
      hub.setAttribute("fill", "#333");
      svg.appendChild(hub);

      // Value text.
      const valueText = document.createElementNS(svgNS, "text");
      valueText.setAttribute("x", String(cx));
      valueText.setAttribute("y", String(cy - radius * 0.35));
      valueText.setAttribute("text-anchor", "middle");
      valueText.setAttribute("font-size", String(Math.max(14, radius * 0.28)));
      valueText.setAttribute("font-weight", "600");
      valueText.setAttribute("fill", "currentColor");
      valueText.textContent = formatVal(value, fmt);
      svg.appendChild(valueText);

      // Label.
      const labelText = document.createElementNS(svgNS, "text");
      labelText.setAttribute("x", String(cx));
      labelText.setAttribute("y", String(cy + 16));
      labelText.setAttribute("text-anchor", "middle");
      labelText.setAttribute("font-size", "11");
      labelText.setAttribute("fill", "color-mix(in oklab, currentColor 60%, transparent)");
      labelText.textContent = label;
      svg.appendChild(labelText);

      container.appendChild(svg);
      dispatch("ready", { value });
    } catch (err: any) {
      const msg = err?.message ?? "Gauge render failed";
      container.innerHTML = `<div class="rb-gauge-error">${msg}</div>`;
      dispatch("renderError", { message: msg });
    }
  }

  // Build a thick arc (annulus segment) from angle a0 to a1.
  function arcPath(cx: number, cy: number, r: number, a0: number, a1: number, w: number): string {
    const r1 = r;
    const r0 = r - w;
    const x0 = cx + r1 * Math.cos(a0);
    const y0 = cy + r1 * Math.sin(a0);
    const x1 = cx + r1 * Math.cos(a1);
    const y1 = cy + r1 * Math.sin(a1);
    const x2 = cx + r0 * Math.cos(a1);
    const y2 = cy + r0 * Math.sin(a1);
    const x3 = cx + r0 * Math.cos(a0);
    const y3 = cy + r0 * Math.sin(a0);
    const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${r1} ${r1} 0 ${largeArc} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${largeArc} 0 ${x3} ${y3} Z`;
  }

  onMount(async () => {
    await tick();
    const hostEl = container?.closest("rb-gauge");
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
        if (componentId && config.namedGaugeOptions?.[componentId]) {
          options = { ...config.namedGaugeOptions[componentId], ...options };
        } else if (config.gaugeOptions) {
          options = { ...config.gaugeOptions, ...options };
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
  .rb-gauge-root { width: 100%; height: 100%; position: relative; min-height: 140px; }
  .rb-gauge-loading, .rb-gauge-error { padding: 1rem; text-align: center; font-size: 12px; }
  .rb-gauge-loading { color: #666; }
  .rb-gauge-error { color: #dc3545; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; }
</style>

{#if selfFetchLoading}
  <div class="rb-gauge-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading gauge…</div>
{/if}
{#if error}
  <div class="rb-gauge-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-gauge-root"
  bind:this={container}
  id={componentId ? `widgetGauge-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
></div>

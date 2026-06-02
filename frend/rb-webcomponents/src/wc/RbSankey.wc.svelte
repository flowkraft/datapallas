<svelte:options customElement={{ tag: "rb-sankey", shadow: "none" }} />

<!--
  rb-sankey — flow diagram (source → target ribbons weighted by value).
  Mirrors Metabase's Sankey viz. Uses d3-sankey for layout, hand-rolled SVG
  for rendering (no extra d3 chart deps).

  ── Consumer modes (mirror rb-map) ─────────────────────────────────────────
  1. Self-contained: set `report-id` + `api-base-url` attributes; component
     fetches { sankeyOptions: { sourceField, targetField, valueField } } + data.
  2. Props-pushed: parent assigns
       el.data    = [{ source: "A", target: "B", value: 12 }, ...]
       el.options = { sourceField: "source", targetField: "target", valueField: "value" }
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

  // 8-color qualitative palette — same vibe as Metabase's default series colors.
  const PALETTE = [
    "#509ee3", "#88bf4d", "#a989c5", "#ef8c8c", "#f9d45c",
    "#f2a86f", "#98d9d9", "#7172ad",
  ];
</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy, tick, createEventDispatcher } from "svelte";
  import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";

  export let reportId: string = "";
  export let apiBaseUrl: string = "";
  export let apiKey: string = "";
  export let componentId: string = "";
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  export let data: Record<string, unknown>[] = [];
  export let options: {
    sourceField?: string;
    targetField?: string;
    valueField?: string;
    nodePadding?: number;
    nodeWidth?: number;
    palette?: string[];
  } = {};

  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  let container: HTMLDivElement;
  let selfFetchLoading = false;
  let error: string | null = null;
  const dispatch = createEventDispatcher();

  function inferField(rows: Record<string, unknown>[], pred: (v: unknown) => boolean, skip: string[] = []): string {
    if (!rows[0]) return "";
    for (const k of Object.keys(rows[0])) {
      if (skip.includes(k)) continue;
      if (pred(rows[0][k])) return k;
    }
    return "";
  }

  function resolveFields(rows: Record<string, unknown>[], opts: typeof options) {
    const isStr = (v: unknown) => typeof v === "string";
    const isNum = (v: unknown) => typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)));
    const sourceField = opts.sourceField || inferField(rows, isStr);
    const targetField = opts.targetField || inferField(rows, isStr, [sourceField]);
    const valueField  = opts.valueField  || inferField(rows, isNum);
    return { sourceField, targetField, valueField };
  }

  function render() {
    if (!container) return;
    try {
      container.innerHTML = "";
      if (!data || data.length === 0) return;

      const { sourceField, targetField, valueField } = resolveFields(data, options);
      if (!sourceField || !targetField || !valueField) {
        container.innerHTML = '<div class="rb-sankey-error">Sankey needs source, target, and value columns.</div>';
        return;
      }

      // Build nodes + links from rows.
      const nodeIndex = new Map<string, number>();
      const nodes: { name: string }[] = [];
      const links: { source: number; target: number; value: number }[] = [];
      for (const row of data) {
        const s = String(row[sourceField] ?? "");
        const t = String(row[targetField] ?? "");
        const v = Number(row[valueField]);
        if (!s || !t || !Number.isFinite(v) || v <= 0) continue;
        if (s === t) continue;
        if (!nodeIndex.has(s)) { nodeIndex.set(s, nodes.length); nodes.push({ name: s }); }
        if (!nodeIndex.has(t)) { nodeIndex.set(t, nodes.length); nodes.push({ name: t }); }
        links.push({ source: nodeIndex.get(s)!, target: nodeIndex.get(t)!, value: v });
      }
      if (nodes.length === 0 || links.length === 0) {
        container.innerHTML = '<div class="rb-sankey-error">No valid flows in the data.</div>';
        return;
      }

      // Safety cap — d3-sankey layout + SVG with thousands of elements will
      // wedge the browser. Bail early with a helpful message so random field
      // picks never freeze the page.
      const MAX_NODES = 200;
      if (nodes.length > MAX_NODES) {
        container.innerHTML =
          '<div class="rb-sankey-error">Too many categories for a readable sankey (' +
          nodes.length + ' nodes, limit ' + MAX_NODES +
          '). Pick lower-cardinality Source / Target columns or add a filter.</div>';
        return;
      }

      const w = container.clientWidth || 600;
      const h = container.clientHeight || 400;
      const palette = options.palette && options.palette.length > 0 ? options.palette : PALETTE;

      const sankeyGen = d3Sankey<any, any>()
        .nodeWidth(options.nodeWidth ?? 14)
        .nodePadding(options.nodePadding ?? 12)
        .nodeAlign(sankeyJustify)
        .extent([[8, 8], [w - 8, h - 8]]);

      const graph = sankeyGen({
        nodes: nodes.map((d) => ({ ...d })),
        links: links.map((d) => ({ ...d })),
      });

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.style.display = "block";

      // Links — paths beneath nodes.
      const linkG = document.createElementNS(svgNS, "g");
      linkG.setAttribute("fill", "none");
      const linkPath = sankeyLinkHorizontal();
      for (const lk of graph.links as any[]) {
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", linkPath(lk) || "");
        const srcColor = palette[(lk.source.index ?? 0) % palette.length];
        path.setAttribute("stroke", srcColor);
        path.setAttribute("stroke-opacity", "0.35");
        path.setAttribute("stroke-width", String(Math.max(1, lk.width ?? 1)));
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${lk.source.name} → ${lk.target.name}: ${formatNumber(lk.value)}`;
        path.appendChild(title);
        path.style.cursor = "pointer";
        path.addEventListener("click", () => dispatch("linkClick", { source: lk.source.name, target: lk.target.name, value: lk.value }));
        linkG.appendChild(path);
      }
      svg.appendChild(linkG);

      // Nodes — rectangles + labels.
      const nodeG = document.createElementNS(svgNS, "g");
      for (const nd of graph.nodes as any[]) {
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(nd.x0));
        rect.setAttribute("y", String(nd.y0));
        rect.setAttribute("width", String(Math.max(1, (nd.x1 ?? 0) - (nd.x0 ?? 0))));
        rect.setAttribute("height", String(Math.max(1, (nd.y1 ?? 0) - (nd.y0 ?? 0))));
        rect.setAttribute("fill", palette[(nd.index ?? 0) % palette.length]);
        rect.setAttribute("stroke", "var(--rb-surface, Canvas)");
        rect.style.cursor = "pointer";
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${nd.name}: ${formatNumber(nd.value ?? 0)}`;
        rect.appendChild(title);
        rect.addEventListener("click", () => dispatch("nodeClick", { name: nd.name, value: nd.value }));
        nodeG.appendChild(rect);

        const label = document.createElementNS(svgNS, "text");
        const onLeft = (nd.x0 ?? 0) < w / 2;
        label.setAttribute("x", String(onLeft ? (nd.x1 ?? 0) + 6 : (nd.x0 ?? 0) - 6));
        label.setAttribute("y", String(((nd.y0 ?? 0) + (nd.y1 ?? 0)) / 2));
        label.setAttribute("dy", "0.35em");
        label.setAttribute("text-anchor", onLeft ? "start" : "end");
        label.setAttribute("font-size", "11");
        label.setAttribute("fill", "currentColor");
        label.textContent = nd.name;
        nodeG.appendChild(label);
      }
      svg.appendChild(nodeG);

      container.appendChild(svg);
      dispatch("ready", { nodeCount: graph.nodes.length, linkCount: graph.links.length });
    } catch (err: any) {
      const msg = err?.message ?? "Sankey render failed";
      container.innerHTML = `<div class="rb-sankey-error">${msg}</div>`;
      dispatch("renderError", { message: msg });
    }
  }

  function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  onMount(async () => {
    await tick();

    const hostEl = container?.closest("rb-sankey");
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
        if (componentId && config.namedSankeyOptions?.[componentId]) {
          options = { ...config.namedSankeyOptions[componentId], ...options };
        } else if (config.sankeyOptions) {
          options = { ...config.sankeyOptions, ...options };
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
        dispatch("dataFetched", { data, totalRows: result?.totalRows ?? data.length });
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
  .rb-sankey-root { width: 100%; height: 100%; position: relative; min-height: 240px; overflow: hidden; }
  .rb-sankey-loading, .rb-sankey-error { padding: 1rem; text-align: center; font-size: 12px; }
  .rb-sankey-loading { color: #666; }
  .rb-sankey-error { color: #dc3545; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; }
</style>

{#if selfFetchLoading}
  <div class="rb-sankey-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading sankey…</div>
{/if}
{#if error}
  <div class="rb-sankey-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-sankey-root"
  bind:this={container}
  id={componentId ? `widgetSankey-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
></div>

<svelte:options customElement={{ tag: "rb-detail", shadow: "none" }} />

<!--
  rb-detail — single-row record viewer. Renders all columns of the first row
  as a key/value list.

  Pure DOM, zero deps.

  Consumer modes:
  1. Self-contained: report-id + api-base-url; fetches { detailOptions } + data.
  2. Props-pushed: el.data = [{...one row}], el.options = { hiddenColumns?: string[] }.
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
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  export let componentId: string = "";
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  export let data: Record<string, unknown>[] = [];
  export let options: {
    hiddenColumns?: string[];
    rowIndex?: number;
    /** Per-column format specs (from type-formatters.ts). Keys are column
     *  names; values `{ kind, currency?, currencyStyle?, decimals?, scale?,
     *  prefix?, suffix?, compact?, dateUnit?, locale? }`.
     *  When a column has a format, the value is rendered via the matching
     *  HTML formatter (link/image/etc.) instead of escaped text. */
    columnFormats?: Record<string, {
      kind: string;
      currency?: string;
      currencyStyle?: "symbol" | "code" | "name";
      decimals?: number;
      scale?: number;
      prefix?: string;
      suffix?: string;
      compact?: boolean;
      dateUnit?: string;
      locale?: string;
    }>;
    /** Per-column header label overrides. */
    columnTitles?: Record<string, string>;
    /** When true, renders a small gear button next to each key; clicking it
     *  bubbles a `.rb-col-settings` click that the React wrapper catches. */
    interactive?: boolean;
  } = {};

  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  let container: HTMLDivElement;
  let selfFetchLoading = false;
  let error: string | null = null;
  const dispatch = createEventDispatcher();

  function formatVal(v: unknown): string {
    if (v == null) return "—";
    if (v instanceof Date) return v.toLocaleString();
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  }

  // Type-aware cell formatters — kept in sync with `type-formatters.ts`.
  // Accepts a FormatSpec-shape (currency, style, decimals, scale, prefix,
  // suffix, compact, dateUnit, locale) so options authored React-side roundtrip
  // through to the standalone HTML export without behavior drift.

  const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const CURRENCIES_WITH_NATIVE_SYMBOLS = new Set([
    "USD", "CAD", "EUR", "AUD", "BRL", "BTC", "CNY", "GBP", "HKD",
    "ILS", "INR", "JPY", "KRW", "MXN", "NZD", "TWD", "VND",
  ]);
  function defaultCurrencyStyle(code: string): "symbol" | "code" {
    return CURRENCIES_WITH_NATIVE_SYMBOLS.has(code) ? "symbol" : "code";
  }

  type Spec = {
    kind: string;
    currency?: string;
    currencyStyle?: "symbol" | "code" | "name";
    decimals?: number;
    scale?: number;
    prefix?: string;
    suffix?: string;
    compact?: boolean;
    dateUnit?: string;
    locale?: string;
  };
  function wrap(core: string, s: Spec): string {
    return (s.prefix || "") + core + (s.suffix || "");
  }

  function formatNumberSpec(v: unknown, s: Spec): string {
    let n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (typeof s.scale === "number" && Number.isFinite(s.scale)) n *= s.scale;
    if (s.compact) {
      return wrap(n.toLocaleString(s.locale, { notation: "compact" as any, maximumFractionDigits: s.decimals ?? 1 }), s);
    }
    const isInt = Number.isInteger(n);
    return wrap(n.toLocaleString(s.locale, {
      minimumFractionDigits: s.decimals ?? 0,
      maximumFractionDigits: s.decimals ?? (isInt ? 0 : 2),
    }), s);
  }

  function formatCurrencySpec(v: unknown, s: Spec): string {
    let n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (typeof s.scale === "number" && Number.isFinite(s.scale)) n *= s.scale;
    const currency = s.currency || "USD";
    const style = s.currencyStyle || defaultCurrencyStyle(currency);
    try {
      return wrap(n.toLocaleString(s.locale, {
        style: "currency",
        currency,
        currencyDisplay: style,
        minimumFractionDigits: s.decimals ?? 2,
        maximumFractionDigits: s.decimals ?? 2,
      }), s);
    } catch {
      return wrap(`${currency} ${n.toLocaleString(s.locale, { maximumFractionDigits: 2 })}`, s);
    }
  }

  function formatPercentSpec(v: unknown, s: Spec): string {
    let n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (typeof s.scale === "number" && Number.isFinite(s.scale)) n *= s.scale;
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return wrap(pct.toLocaleString(s.locale, {
      minimumFractionDigits: s.decimals ?? 0,
      maximumFractionDigits: s.decimals ?? 1,
    }) + "%", s);
  }

  function formatDateSpec(v: unknown, s: Spec): string {
    const unit = s.dateUnit;
    if (unit === "day-of-week") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 6) return DOW_NAMES[n];
      if (Number.isInteger(n) && n >= 1 && n <= 7) return DOW_NAMES[n % 7];
      return String(v);
    }
    if (unit === "hour-of-day") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 23) return String(n).padStart(2, "0") + ":00";
      return String(v);
    }
    if (unit === "month-of-year") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 12) return MONTH_NAMES[n - 1];
      return String(v);
    }
    if (unit === "quarter-of-year") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 4) return "Q" + n;
      return String(v);
    }
    const d = v instanceof Date ? v : new Date(String(v));
    if (!Number.isFinite(d.getTime())) return String(v);
    switch (unit) {
      case "year":    return d.toLocaleDateString(s.locale, { year: "numeric" });
      case "quarter": return "Q" + (Math.floor(d.getMonth() / 3) + 1) + " " + d.getFullYear();
      case "month":   return d.toLocaleDateString(s.locale, { year: "numeric", month: "short" });
      case "week":
      case "day":     return d.toLocaleDateString(s.locale, { year: "numeric", month: "short", day: "numeric" });
      case "hour":
      case "minute":  return d.toLocaleString(s.locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
      default:        return d.toLocaleDateString(s.locale, { year: "numeric", month: "short", day: "numeric" });
    }
  }

  // Deliberately parallel to `formatCellHtml()` in
  // `lib/data-canvas/type-formatters.ts` (React side). This Svelte copy makes
  // the standalone HTML export self-contained — no TS runtime needed at render
  // time. Keep currency style, decimals, date-unit handling, and null/HTML
  // escaping in sync when editing either side.
  function formatByKind(v: unknown, s: Spec): string {
    if (v == null) return "—";
    switch (s.kind) {
      case "url": {
        const url = String(v);
        const safe = escapeHtml(url);
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:var(--rb-accent, var(--color-primary, #2171b5));text-decoration:underline">${safe}</a>`;
      }
      case "email": {
        const addr = String(v);
        const safe = escapeHtml(addr);
        return `<a href="mailto:${safe}" style="color:var(--rb-accent, var(--color-primary, #2171b5));text-decoration:underline">${safe}</a>`;
      }
      case "image": {
        const url = String(v);
        const safe = escapeHtml(url);
        return `<img src="${safe}" alt="" style="max-height:40px;max-width:100%;vertical-align:middle;object-fit:contain" loading="lazy" />`;
      }
      case "country": {
        // ISO-2 → emoji flag + code; full names → plain text.
        const raw = String(v);
        const upper = raw.toUpperCase();
        if (/^[A-Z]{2}$/.test(upper)) {
          const A = 0x41, REGIONAL_A = 0x1F1E6;
          const flag = String.fromCodePoint(
            REGIONAL_A + (upper.charCodeAt(0) - A),
            REGIONAL_A + (upper.charCodeAt(1) - A),
          );
          return `<span class="rb-fmt-country" title="${escapeHtml(raw)}"><span style="margin-right:4px">${flag}</span>${escapeHtml(upper)}</span>`;
        }
        return escapeHtml(raw);
      }
      case "state": {
        // 2-letter codes → monospace tag; full names → plain text.
        const raw = String(v);
        if (/^[A-Za-z]{2}$/.test(raw)) {
          return `<span class="rb-fmt-state" style="padding:1px 6px;border:1px solid var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;">${escapeHtml(raw.toUpperCase())}</span>`;
        }
        return escapeHtml(raw);
      }
      case "currency":   return escapeHtml(formatCurrencySpec(v, s));
      case "percentage": return escapeHtml(formatPercentSpec(v, s));
      case "coordinate": {
        const n = typeof v === "number" ? v : Number(v);
        return escapeHtml(Number.isFinite(n) ? n.toFixed(5) + "°" : String(v));
      }
      case "duration": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return escapeHtml(String(v));
        const secs = Math.abs(n) >= 1000 ? Math.floor(n / 1000) : Math.floor(n);
        const days = Math.floor(secs / 86400);
        const hours = Math.floor((secs % 86400) / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        const rem = secs % 60;
        if (days > 0)  return escapeHtml(`${days}d ${hours}h`);
        if (hours > 0) return escapeHtml(`${hours}h ${mins}m`);
        if (mins > 0)  return escapeHtml(`${mins}m ${rem}s`);
        return escapeHtml(`${rem}s`);
      }
      case "date":       return escapeHtml(formatDateSpec(v, s));
      case "boolean": {
        if (v === true || v === 1 || v === "1") return "Yes";
        if (v === false || v === 0 || v === "0") return "—";
        const t = String(v).toLowerCase();
        if (t === "true" || t === "y" || t === "yes") return "Yes";
        if (t === "false" || t === "n" || t === "no") return "—";
        return escapeHtml(String(v));
      }
      case "number":     return escapeHtml(formatNumberSpec(v, s));
      default:           return escapeHtml(formatVal(v));
    }
  }

  function render() {
    if (!container) return;
    try {
      container.innerHTML = "";
      if (!data || data.length === 0) return;

      const idx = Math.max(0, Math.min(data.length - 1, options.rowIndex ?? 0));
      const row = data[idx];
      const hidden = new Set(options.hiddenColumns ?? []);
      const entries = Object.entries(row).filter(([k]) => !hidden.has(k));

      if (entries.length === 0) {
        container.innerHTML = '<div class="rb-detail-error">All columns are hidden.</div>';
        return;
      }

      const wrap = document.createElement("div");
      wrap.style.cssText = "padding:8px;font-family:inherit;height:100%;overflow:auto;";

      if (data.length > 1) {
        const note = document.createElement("div");
        note.style.cssText = "font-size:11px;color:color-mix(in oklab, currentColor 60%, transparent);margin-bottom:6px;";
        note.textContent = `Showing row ${idx + 1} of ${data.length}.`;
        wrap.appendChild(note);
      }

      const dl = document.createElement("dl");
      dl.style.cssText = "display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;font-size:12px;margin:0;";

      const formats = options.columnFormats ?? {};
      const titles = options.columnTitles ?? {};
      const interactive = options.interactive === true;
      for (const [key, val] of entries) {
        const dt = document.createElement("dt");
        dt.style.cssText = "color:color-mix(in oklab, currentColor 60%, transparent);font-weight:600;display:flex;align-items:center;gap:4px;";
        const label = document.createElement("span");
        label.textContent = titles[key] ?? key;
        dt.appendChild(label);

        if (interactive) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "rb-col-settings";
          btn.dataset.field = key;
          btn.setAttribute("aria-label", "Column settings for " + key);
          btn.title = "Column settings";
          btn.style.cssText = "padding:1px;border:none;background:transparent;color:color-mix(in oklab, currentColor 60%, transparent);cursor:pointer;line-height:0;opacity:0.4;";
          btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>`;
          btn.onmouseenter = () => { btn.style.opacity = "1"; };
          btn.onmouseleave = () => { btn.style.opacity = "0.4"; };
          dt.appendChild(btn);
        }

        const dd = document.createElement("dd");
        dd.style.cssText = "margin:0;color:inherit;word-break:break-word;";
        const spec = formats[key];
        if (spec && spec.kind) {
          dd.innerHTML = formatByKind(val, spec);
        } else {
          dd.innerHTML = escapeHtml(formatVal(val));
        }
        dl.appendChild(dt);
        dl.appendChild(dd);
      }

      wrap.appendChild(dl);
      container.appendChild(wrap);
      dispatch("ready", { rowIndex: idx, fieldCount: entries.length });
    } catch (err: any) {
      const msg = err?.message ?? "Detail render failed";
      container.innerHTML = `<div class="rb-detail-error">${msg}</div>`;
      dispatch("renderError", { message: msg });
    }
  }

  onMount(async () => {
    await tick();
    const hostEl = container?.closest("rb-detail");
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute("report-id") || "";
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute("api-base-url") || "";
      if (!apiKey) apiKey = hostEl.getAttribute("api-key") || "";
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
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
        if (componentId && config.namedDetailOptions?.[componentId]) {
          options = { ...config.namedDetailOptions[componentId], ...options };
        } else if (config.detailOptions) {
          options = { ...config.detailOptions, ...options };
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
  .rb-detail-root { width: 100%; height: 100%; position: relative; overflow: auto; }
  .rb-detail-loading, .rb-detail-error { padding: 1rem; text-align: center; font-size: 12px; }
  .rb-detail-loading { color: #666; }
  .rb-detail-error { color: #dc3545; background: #fff5f5; border: 1px solid #dc3545; border-radius: 4px; }
</style>

{#if selfFetchLoading}
  <div class="rb-detail-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading detail…</div>
{/if}
{#if error}
  <div class="rb-detail-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-detail-root"
  bind:this={container}
  id={componentId ? `widgetDetail-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
></div>

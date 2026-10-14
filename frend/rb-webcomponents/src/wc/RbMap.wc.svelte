<svelte:options customElement={{ tag: "rb-map", shadow: "none" }} />

<!--
  rb-map — Leaflet-backed geographic visualization.
  
  ── How it picks a mode ─────────────────────────────────────────────────────
  mapType="auto" (default) inspects the data + options:
    - latField + lonField present AND both numeric → "pin"
    - latField + lonField present AND the query binned both → "grid"
    - dimension column looks like a US state         → "region" + us_states
    - dimension column looks like a country          → "region" + world_countries
    - fallback → "region" + world_countries

  ── Consumer modes (same as every other rb-* component) ────────────────────
  1. Self-contained: set `report-id` + `api-base-url` attributes; the
     component fetches config + data from the reporting REST API. Config
     shape: { mapOptions: { dimension, metric, mapType, region, ... } }.
  2. Props-pushed: parent (React data-canvas ChartWidget) assigns
       el.data    = [{country: "Germany", sales: 12345}, ...]
       el.options = { dimension: "country", metric: "sales", mapType: "auto" }
     No fetch happens — map renders immediately.

  ── GeoJSON ────────────────────────────────────────────────────────────────
  Loaded at runtime from a public CDN (overridable via `geoJsonUrl` prop).
  Defaults pick sensible Natural Earth / US Census files keyed by
  ISO_A2 (countries) or STUSPS (states).

  ── Tiles ──────────────────────────────────────────────────────────────────
  OpenStreetMap (free, no API key). Override via `tileUrl` / `attribution`
  props if you want a different basemap (Carto, Stamen, Mapbox with key…).
-->

<script context="module" lang="ts">
  // Module-level caches — shared across all <rb-map> instances on the page.
  const _cfgCache = new Map<string, Promise<any>>();
  const _geoJsonCache = new Map<string, Promise<any>>();

  function fetchConfigCached(url: string, headers: Record<string, string>): Promise<any> {
    let p = _cfgCache.get(url);
    if (p) return p;
    p = fetch(url, { headers })
      .then(r => { if (!r.ok) throw new Error(`Config fetch failed: ${r.status}`); return r.json(); })
      .catch(e => { _cfgCache.delete(url); throw e; });
    _cfgCache.set(url, p);
    return p;
  }

  function fetchGeoJsonCached(url: string): Promise<any> {
    let p = _geoJsonCache.get(url);
    if (p) return p;
    p = fetch(url)
      .then(r => { if (!r.ok) throw new Error(`GeoJSON fetch failed: ${r.status}`); return r.json(); })
      .catch(e => { _geoJsonCache.delete(url); throw e; });
    _geoJsonCache.set(url, p);
    return p;
  }

  // Inject Leaflet's stylesheet into document.head exactly once. The file is
  // pulled from the CDN (same version as the bundled JS) so we don't have to
  // bundle ~14KB of CSS ourselves. Falls back gracefully if CDN blocked.
  let _leafletCssInjected = false;
  function injectLeafletCss() {
    if (_leafletCssInjected) return;
    if (typeof document === "undefined") return;
    if (document.getElementById("rb-map-leaflet-css")) { _leafletCssInjected = true; return; }
    const link = document.createElement("link");
    link.id = "rb-map-leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.crossOrigin = "";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    document.head.appendChild(link);
    _leafletCssInjected = true;
  }

  // Default GeoJSON sources. Overridable per-instance via `geoJsonUrl` prop.
  // world.geojson — natural earth 110m admin_0 countries, has ISO_A2 property.
  // us-states — PublicaMundi mirror of US census states, has `id` = STUSPS code.
  const DEFAULT_GEOJSON_URLS: Record<string, string> = {
    world_countries: "/geojson/countries.geojson",
    us_states: "/geojson/us-states.geojson",
  };

  // Property keys used to identify a feature in each built-in GeoJSON. When
  // `geoJsonKey` isn't explicitly set we try these in order.
  const DEFAULT_KEY_CANDIDATES: Record<string, string[]> = {
    world_countries: ["ISO3166-1-Alpha-2", "ISO_A2", "iso_a2", "ISO2", "A2", "id"],
    // The shipped us-states.geojson keys its features by FIPS number (`id` "41" is Oregon) and names
    // them (`name` "Oregon"), so the name comes before the id; `featureKey` reads it as a USPS code.
    us_states:       ["STUSPS", "STATE", "postal", "abbr", "name", "id"],
  };

  // ColorBrewer-style 5-bucket blue sequential palette. Meaningful without
  // configuration, accessible contrast.
  const DEFAULT_COLOR_SCALE = [
    "#deebf7", "#9ecae1", "#4292c6", "#2171b5", "#08519c",
  ];

  // The world as the tiles draw it: Web Mercator stops at 85.0511 degrees north and south.
  const WORLD_BOUNDS: [[number, number], [number, number]] = [[-85.0511, -180], [85.0511, 180]];

  const MISSING_COLOR = "#f0f0f0";
  const MISSING_STROKE = "#cccccc";
</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy, tick, createEventDispatcher } from "svelte";
  import { reportQuery } from '../shared/report-query';
  import { CROSS_FILTER_EVENT } from '../shared/slicer-selections';
  import { normalizeCountryToIso2 } from "./map/country-lookup";
  import { normalizeStateToUsps } from "./map/state-lookup";
  import { findLatitudeColumn, findLongitudeColumn } from "../shared/map-column-names";

  // ============================================================================
  // Hybrid Mode Props — when reportId is provided, component self-fetches.
  // ============================================================================
  export let reportId: string = "";
  export let apiBaseUrl: string = "";
  export let apiKey: string = "";
  /** Short-lived token minted by the embedding page's server; unlocks only this report. */
  export let embedToken: string = '';
  export let componentId: string = "";
  export let reportParams: Record<string, string> = {};
  export let testMode: boolean = false;

  // Clicks that filter the dashboard: a click on a region or a point selects the value its own
  // dimension column holds for it, the way a slicer pick does. A map has no DSL of its own, so a
  // published map is told by its `-map-config.json` entry (`clicksFilter`), and the canvas sets
  // the prop.
  export let clicksFilter: boolean = false;

  // ============================================================================
  // Props Mode — row objects + options passed by the parent (React / Angular).
  // ============================================================================
  export let data: Record<string, unknown>[] = [];
  export let options: {
    mapType?: "auto" | "region" | "pin" | "grid";
    region?: "auto" | "us_states" | "world_countries";
    dimension?: string;
    metric?: string;
    latField?: string;
    lonField?: string;
    geoJsonUrl?: string;
    geoJsonKey?: string;            // feature.properties key to match rows against
    tileUrl?: string;
    attribution?: string;
    colorScale?: string[];
    zoom?: number | null;
    center?: [number, number] | null;
    fitBounds?: boolean;
    /** A click on a region or a point selects its dimension value (`slicer-filters.ts`). */
    clicksFilter?: boolean;
  } = {};

  // What a published map is told by its own `-map-config.json` entry.
  $: if (options?.clicksFilter === true) clicksFilter = true;

  export let loading: boolean = false;
  export let width: string | number | undefined = undefined;
  export let height: string | number | undefined = undefined;

  // ============================================================================
  // Internal state
  // ============================================================================
  let container: HTMLDivElement;
  let selfFetchLoading = false;
  let error: string | null = null;
  let mapInstance: any = null;          // L.Map
  let layerGroup: any = null;           // L.LayerGroup holding data layers
  // What the map frames: the data's bounds, kept so that the box can be framed again once it has its
  // real size (fitToData). Null when the author set a centre and zoom, or turned fitting off.
  let fitTarget: any = null;
  let resolved: ResolvedOptions = {
    mapType: "region", region: "world_countries", dimension: "", metric: "",
    latField: "", lonField: "", geoJsonUrl: "", geoJsonKey: "", tileUrl: "",
    attribution: "", colorScale: DEFAULT_COLOR_SCALE, zoom: null, center: null, fitBounds: true,
  };
  const dispatch = createEventDispatcher();

  // Public accessor — lets parents poke at the Leaflet map directly after `ready`.
  export function getMapInstance() { return mapInstance; }

  // ──────────────────────────────────────────────────────────────────────────
  // Mode detection
  // ──────────────────────────────────────────────────────────────────────────

  interface ResolvedOptions {
    mapType: "region" | "pin" | "grid";
    region: "us_states" | "world_countries";
    dimension: string;
    metric: string;
    latField: string;
    lonField: string;
    geoJsonUrl: string;
    geoJsonKey: string;
    tileUrl: string;
    attribution: string;
    colorScale: string[];
    zoom: number | null;
    center: [number, number] | null;
    fitBounds: boolean;
  }

  function resolveOptions(rows: Record<string, unknown>[], opts: typeof options): ResolvedOptions {
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    const lower = (s: string) => s.toLowerCase();

    // Infer lat/lon columns by common names if not specified. Uses the
    // shared name predicates (same regex source of truth as the Next.js
    // classification layer — see frend/rb-webcomponents/src/shared/map-column-names.ts).
    const latField = opts.latField ?? findLatitudeColumn(cols) ?? "";
    const lonField = opts.lonField ?? findLongitudeColumn(cols) ?? "";

    // Infer dimension column: first non-numeric, non-lat-lon column.
    // When opts.dimension is configured (e.g. "shipcountry"), resolve it
    // case-insensitively against actual data keys (API may return "ShipCountry").
    const dimension = opts.dimension
      ? (cols.find((c) => lower(c) === lower(opts.dimension!)) ?? opts.dimension)
      : (cols.find((c) => c !== latField && c !== lonField && !isNumericCol(rows, c)) ?? "");

    // Infer metric column: first numeric column that isn't lat/lon.
    const metric = opts.metric
      ? (cols.find((c) => lower(c) === lower(opts.metric!)) ?? opts.metric)
      : (cols.find((c) => c !== latField && c !== lonField && isNumericCol(rows, c)) ?? "");

    // Pick map type.
    let mapType: "region" | "pin" | "grid" = "region";
    if (opts.mapType && opts.mapType !== "auto") {
      mapType = opts.mapType;
    } else if (latField && lonField && rows.length > 0) {
      // If the query binned both lat and lon (values land on a grid),
      // prefer grid heatmap; otherwise pins.
      mapType = looksBinned(rows, latField) && looksBinned(rows, lonField) ? "grid" : "pin";
    } else {
      mapType = "region";
    }

    // Pick region sub-type by sniffing the dimension values.
    let region: "us_states" | "world_countries" = "world_countries";
    if (opts.region && opts.region !== "auto") {
      region = opts.region;
    } else if (mapType === "region" && dimension && rows.length > 0) {
      region = sniffRegion(rows, dimension);
    }

    const geoJsonUrl = opts.geoJsonUrl ?? DEFAULT_GEOJSON_URLS[region];
    const geoJsonKey = opts.geoJsonKey ?? "";
    // OpenStreetMap's own address, with no a/b/c subdomain: OSM no longer asks for them.
    const tileUrl = opts.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    const attribution = opts.attribution
      ?? "© <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>OpenStreetMap</a> contributors";
    const colorScale = opts.colorScale && opts.colorScale.length > 0 ? opts.colorScale : DEFAULT_COLOR_SCALE;

    return {
      mapType, region, dimension, metric, latField, lonField,
      geoJsonUrl, geoJsonKey, tileUrl, attribution, colorScale,
      zoom: opts.zoom ?? null,
      center: opts.center ?? null,
      fitBounds: opts.fitBounds !== false,
    };
  }

  function isNumericCol(rows: Record<string, unknown>[], col: string): boolean {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const v = rows[i][col];
      if (v == null) continue;
      if (typeof v === "number") return true;
      if (typeof v === "string" && v !== "" && !isNaN(Number(v))) return true;
      return false;
    }
    return false;
  }

  function looksBinned(rows: Record<string, unknown>[], col: string): boolean {
    // Heuristic: if the distinct count is much smaller than the row count,
    // the values are likely bucketed. 50 bins / 10000 rows → binned.
    const seen = new Set<number>();
    for (const r of rows) {
      const n = Number(r[col]);
      if (Number.isFinite(n)) seen.add(n);
      if (seen.size > 200) return false;
    }
    return rows.length > seen.size * 4;
  }

  function sniffRegion(rows: Record<string, unknown>[], col: string): "us_states" | "world_countries" {
    // Try the first 30 distinct values — if most normalize as US states → us_states,
    // if most normalize as countries → world_countries.
    let states = 0, countries = 0, total = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const raw = r[col];
      const key = raw == null ? "" : String(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      total++;
      if (normalizeStateToUsps(raw)) states++;
      if (normalizeCountryToIso2(raw)) countries++;
      if (total >= 30) break;
    }
    // States win only if strictly more state-matches than country-matches AND
    // states cover ≥50% of distinct values (avoids matching "GA" as Georgia US
    // when the dataset is really full country names).
    if (states > countries && states / Math.max(total, 1) >= 0.5) return "us_states";
    return "world_countries";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GeoJSON key discovery + row→feature join
  // ──────────────────────────────────────────────────────────────────────────

  function pickGeoJsonKey(geo: any, region: "us_states" | "world_countries", override: string): string {
    if (override) return override;
    const feat = geo?.features?.[0];
    if (!feat) return "id";
    const candidates = DEFAULT_KEY_CANDIDATES[region];
    for (const k of candidates) {
      if (k === "id" && feat.id != null) return "id";
      if (feat.properties && feat.properties[k] != null) return k;
    }
    return "id";
  }

  function canonicalKey(
    raw: unknown,
    region: "us_states" | "world_countries",
  ): string | null {
    if (region === "us_states") return normalizeStateToUsps(raw);
    return (normalizeCountryToIso2(raw) ?? "").toUpperCase() || null;
  }

  function featureKey(feature: any, keyProp: string, region: "us_states" | "world_countries"): string {
    const rawKey = keyProp === "id" ? feature.id : feature.properties?.[keyProp];
    if (rawKey == null) return "";
    // A state is matched as its data is (`canonicalKey`): a name or a code, read as the USPS code.
    if (region === "us_states") return normalizeStateToUsps(rawKey) ?? String(rawKey).toUpperCase();
    return String(rawKey).toUpperCase();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Color scale — quantile bucketing over non-zero metric values.
  // ──────────────────────────────────────────────────────────────────────────

  function buildQuantileScale(values: number[], palette: string[]): (v: number) => string {
    const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) return () => MISSING_COLOR;
    const buckets = palette.length;
    const thresholds: number[] = [];
    for (let i = 1; i < buckets; i++) {
      const q = i / buckets;
      const pos = q * (sorted.length - 1);
      const lo = Math.floor(pos), hi = Math.ceil(pos);
      thresholds.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
    }
    return (v: number) => {
      if (!Number.isFinite(v)) return MISSING_COLOR;
      let i = 0;
      while (i < thresholds.length && v >= thresholds[i]) i++;
      return palette[i];
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render paths
  // ──────────────────────────────────────────────────────────────────────────

  // Renders overlap (the first one on mount, the next when the data lands) and a region map waits
  // for its GeoJSON: only the newest render may draw, or both add their shapes to the map.
  let renderGeneration = 0;

  async function renderMap() {
    if (!container) return;
    const generation = ++renderGeneration;
    try {
      showRuntimeError(null);   // imperative — does NOT trigger $invalidate
      injectLeafletCss();

      const L = (await import("leaflet")).default as any;
      if (generation !== renderGeneration) return;

      // Resolve options first — they drive tile URL, mode selection, etc.
      resolved = resolveOptions(data ?? [], options);

      if (!mapInstance) {
        // The map never shows past the world's edges. A view zoomed out further than the world is
        // tall - a country map fitting every country, Antarctica included, into a wide box - left a
        // grey band under the world. So the map can neither be dragged past the top or bottom
        // (maxBounds, viscosity 1) nor zoomed out below the zoom at which the world fills the box
        // (fillWithWorld, again on every resize). Quarter steps let that zoom fit the box closely
        // instead of jumping a whole level, which would show half the world.
        mapInstance = L.map(container, {
          preferCanvas: true, zoomSnap: 0.25, maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1,
        });
        // Each tile names the site it is drawn on (its origin, nothing more). OpenStreetMap's tile
        // policy requires it: a tile asked with no Referer comes back as an "Access blocked" picture,
        // with status 200, so nothing reports it. A published dashboard sends no referrer at all
        // (<meta name="referrer" content="no-referrer">, to keep a share token in its address from
        // leaving the page); this attribute overrides that for the tiles only, and the origin
        // carries no path and no query, so the token stays where it is.
        L.tileLayer(resolved.tileUrl, { maxZoom: 18, referrerPolicy: "strict-origin" }).addTo(mapInstance);
        layerGroup = L.layerGroup().addTo(mapInstance);
        // World fallback view until fitBounds runs (prevents blank canvas). The lowest zoom is
        // known before it, so the map opens there and fetches no tiles for a zoom it then leaves.
        fillWithWorld();
        mapInstance.setView([20, 0], 2);
        // Leaflet computes viewport from container.clientHeight at init time.
        // In a flex/grid layout the container can still be sizing up when
        // L.map() runs, leaving the tile pane rendered at a stale (too-short)
        // height — the grey strip at the bottom. Call invalidateSize() after
        // the browser has committed layout (100ms) AND again on any container
        // resize (grid-item drag, window resize, panel toggle).
        setTimeout(() => { try { mapInstance?.invalidateSize(); fillWithWorld(); fitToData(); } catch {} }, 100);
        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => {
            // debounce: let the final size settle before telling Leaflet
            setTimeout(() => { try { mapInstance?.invalidateSize(); fillWithWorld(); fitToData(); } catch {} }, 0);
          });
          ro.observe(container);
          (mapInstance as any)._rbResizeObserver = ro;
        }
        dispatch("ready", { map: mapInstance });
      } else {
        layerGroup.clearLayers();
      }
      fitTarget = null;
      publishShapeCount();

      if (!data || data.length === 0) return;

      if (resolved.mapType === "pin") {
        renderPins(L, resolved);
      } else if (resolved.mapType === "grid") {
        renderGrid(L, resolved);
      } else {
        await renderRegion(L, resolved, generation);
        if (generation !== renderGeneration) return;
      }
      publishShapeCount();

      if (resolved.center && resolved.zoom != null) {
        fitTarget = null;
        mapInstance.setView(resolved.center, resolved.zoom);
      }
    } catch (err: any) {
      const msg = err?.message ?? "Map render failed";
      showRuntimeError(msg);   // imperative
      dispatch("renderError", { message: msg });
    }
  }

  // Canvas-drawn shapes leave nothing in the DOM to count, so the number drawn is written on the
  // container: a person can't count them either, but a test (and a curious developer) can.
  /**
   * The lowest zoom is the one at which the world still fills the box, in both directions: below
   * it the box would show grey past the world's edges. Asked again whenever the box changes size,
   * because a taller box needs a closer zoom. A box not laid out yet has no size to fill.
   */
  function fillWithWorld() {
    if (!mapInstance || !container || container.clientWidth === 0 || container.clientHeight === 0) return;
    const min = mapInstance.getBoundsZoom(WORLD_BOUNDS, true);
    // Up to it at once: setMinZoom would get there with an animated zoom (see onDestroy).
    if (mapInstance.getZoom() < min) mapInstance.setZoom(min, { animate: false });
    mapInstance.setMinZoom(min);
  }

  /**
   * Frame the data, now and again whenever the box changes size.
   *
   * A fit is worked out for the box as it is at that moment. On a dashboard's own page the tile was
   * still sizing up when the data arrived, so the fit was made for a box that was not the final one,
   * and the lowest zoom set afterwards for the real box kept the view where that fit left it: DD02's
   * countries map opened on the Gulf of Guinea, DD03's pins on Greenland, while the same maps framed
   * well in the narrower Gallery cards. So the bounds are kept, and framed again once the box has
   * its size - which also keeps the data framed when a tile is resized.
   *
   * Without the zoom animation: an animated fit ends a few frames later, and on a box that had left
   * the page by then (a Cube Stories panel closed by the next one) Leaflet threw on its own
   * (`_leaflet_pos` of undefined), outside any try.
   */
  function fitToData(bounds?: any) {
    if (bounds !== undefined) fitTarget = bounds;
    if (!mapInstance || !fitTarget || !container || !container.isConnected
        || container.clientWidth === 0 || container.clientHeight === 0) return;
    try { mapInstance.fitBounds(fitTarget, { animate: false }); } catch {}
  }

  function publishShapeCount() {
    if (!container || !layerGroup) return;
    let n = 0;
    const walk = (layer: any) => { if (typeof layer.eachLayer === "function") layer.eachLayer(walk); else n++; };
    layerGroup.eachLayer(walk);
    container.setAttribute("data-shape-count", String(n));
  }

  function renderPins(L: any, r: ResolvedOptions) {
    if (!r.latField || !r.lonField) {
      showRuntimeError("Pin map needs latitude/longitude columns.");
      return;
    }
    const markers: any[] = [];
    const metricValues: number[] = [];
    if (r.metric) {
      for (const row of data) {
        const m = Number(row[r.metric]);
        if (Number.isFinite(m)) metricValues.push(m);
      }
    }
    for (const row of data) {
      const lat = Number(row[r.latField]);
      const lon = Number(row[r.lonField]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const m = L.circleMarker([lat, lon], {
        radius: 5,
        color: "#2171b5",
        fillColor: "#4292c6",
        fillOpacity: 0.7,
        weight: 1,
      });
      m.bindPopup(buildPopup(row));
      m.on("click", () => {
        dispatch("pointClick", { row, lat, lon });
        maybeCrossFilter(row, r.dimension);
      });
      markers.push(m);
      layerGroup.addLayer(m);
    }
    if (r.fitBounds && markers.length > 0) {
      fitToData(L.featureGroup(markers).getBounds().pad(0.1));
    }
  }

  function renderGrid(L: any, r: ResolvedOptions) {
    if (!r.latField || !r.lonField || !r.metric) {
      showRuntimeError("Grid map needs latField, lonField, and metric.");
      return;
    }
    // Cell size: distance between the two lowest distinct lat values.
    const latVals = [...new Set(data.map((d) => Number(d[r.latField])).filter(Number.isFinite))].sort((a, b) => a - b);
    const lonVals = [...new Set(data.map((d) => Number(d[r.lonField])).filter(Number.isFinite))].sort((a, b) => a - b);
    const latStep = latVals.length > 1 ? latVals[1] - latVals[0] : 1;
    const lonStep = lonVals.length > 1 ? lonVals[1] - lonVals[0] : 1;

    const values = data.map((d) => Number(d[r.metric])).filter(Number.isFinite);
    const colorFor = buildQuantileScale(values, r.colorScale);

    const rects: any[] = [];
    for (const row of data) {
      const lat = Number(row[r.latField]);
      const lon = Number(row[r.lonField]);
      const m = Number(row[r.metric]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const rect = L.rectangle(
        [[lat, lon], [lat + latStep, lon + lonStep]],
        { color: "#666", weight: 0.5, fillColor: colorFor(m), fillOpacity: 0.7 },
      );
      rect.bindPopup(buildPopup(row));
      rects.push(rect);
      layerGroup.addLayer(rect);
    }
    if (r.fitBounds && rects.length > 0) {
      fitToData(L.featureGroup(rects).getBounds().pad(0.05));
    }
  }

  /**
   * The one click that filters: the row behind the region or the point just clicked, read at its
   * own dimension column, as a selection of that field.
   *
   * Nothing is sent when the author did not tick the box, when the map has no dimension column, or
   * when the click landed on a shape no row answers for - a region with no data is not a value.
   */
  function maybeCrossFilter(row: Record<string, unknown> | undefined, dimension: string) {
    if (!clicksFilter || !row || !dimension) return;
    const raw = row[dimension];
    const value = raw == null ? "" : String(raw);
    if (!value) return;
    dispatch(CROSS_FILTER_EVENT, { field: dimension, value });
  }

  async function renderRegion(L: any, r: ResolvedOptions, generation: number) {
    if (!r.dimension || !r.metric) {
      showRuntimeError("Region map needs dimension + metric columns.");
      return;
    }
    const geo = await fetchGeoJsonCached(r.geoJsonUrl);
    if (generation !== renderGeneration) return;
    const keyProp = pickGeoJsonKey(geo, r.region, r.geoJsonKey);

    // Build row lookup keyed by canonical code.
    const rowByKey = new Map<string, Record<string, unknown>>();
    const metricByKey = new Map<string, number>();
    for (const row of data) {
      const k = canonicalKey(row[r.dimension], r.region);
      if (!k) continue;
      rowByKey.set(k, row);
      const m = Number(row[r.metric]);
      if (Number.isFinite(m)) metricByKey.set(k, m);
    }

    const colorFor = buildQuantileScale([...metricByKey.values()], r.colorScale);
    // The regions the data answers for: the map frames them, not the whole world (fitToData).
    const answered = L.latLngBounds([]);

    const layer = L.geoJSON(geo, {
      style: (feature: any) => {
        const fk = featureKey(feature, keyProp, r.region);
        const m = metricByKey.get(fk);
        return {
          fillColor: m == null ? MISSING_COLOR : colorFor(m),
          fillOpacity: m == null ? 0.35 : 0.85,
          weight: 0.7,
          color: MISSING_STROKE,
        };
      },
      onEachFeature: (feature: any, fLayer: any) => {
        const fk = featureKey(feature, keyProp, r.region);
        const row = rowByKey.get(fk);
        const regionName =
          feature.properties?.NAME ??
          feature.properties?.name ??
          feature.properties?.ADMIN ??
          fk;
        const metricVal = row ? row[r.metric] : null;
        if (row && typeof fLayer.getBounds === "function") answered.extend(fLayer.getBounds());
        fLayer.bindTooltip(
          `<strong>${escapeHtml(String(regionName))}</strong>` +
          (metricVal == null ? "<br><em>no data</em>" : `<br>${escapeHtml(r.metric)}: ${formatNumber(Number(metricVal))}`),
          { sticky: true },
        );
        fLayer.on({
          mouseover: (e: any) => e.target.setStyle({ weight: 2, color: "#333" }),
          mouseout: (e: any) => layer.resetStyle(e.target),
          click: () => {
            dispatch("regionClick", { row, key: fk, feature });
            maybeCrossFilter(row, r.dimension);
          },
        });
      },
    });
    layerGroup.addLayer(layer);

    if (r.fitBounds) {
      try { fitToData((answered.isValid() ? answered : layer.getBounds()).pad(0.05)); } catch {}
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Misc helpers
  // ──────────────────────────────────────────────────────────────────────────

  function buildPopup(row: Record<string, unknown>): string {
    const entries = Object.entries(row).slice(0, 8);
    const cells = entries.map(([k, v]) =>
      `<tr><td style="padding:2px 6px;font-weight:600">${escapeHtml(k)}</td><td style="padding:2px 6px">${escapeHtml(String(v ?? ""))}</td></tr>`
    ).join("");
    return `<table style="font-size:11px;border-collapse:collapse">${cells}</table>`;
  }

  function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  }

  // Imperative runtime-error display. Writing to the reactive `error` let
  // from render paths triggers Svelte `$invalidate` → afterUpdate → renderMap
  // → error=null → invalidate → infinite loop (see README "Contributor Rule
  // — Svelte reactive-write discipline"). This helper manipulates container
  // DOM directly, bypassing Svelte's reactivity. The top-level `error` let
  // stays reactive for onMount's self-fetch catch path, which is safe.
  function showRuntimeError(msg: string | null) {
    if (!container) return;
    const prev = container.querySelector(':scope > .rb-map-runtime-error');
    prev?.remove();
    if (msg) {
      const div = document.createElement("div");
      div.className = "rb-map-runtime-error rb-map-error";
      div.textContent = msg;
      div.style.cssText = "position:absolute;top:0;left:0;right:0;padding:1rem;background:var(--color-base-100, #fff5f5);color:var(--color-error, #dc3545);border:1px solid var(--color-error, #dc3545);z-index:1000;font-size:12px;";
      container.appendChild(div);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  onMount(async () => {
    await tick();

    // Read attributes off the host element (Svelte props may be populated late).
    const hostEl = container?.closest("rb-map");
    if (hostEl) {
      if (!reportId) reportId = hostEl.getAttribute("report-id") || "";
      if (!apiBaseUrl) apiBaseUrl = hostEl.getAttribute("api-base-url") || "";
      if (!apiKey) apiKey = hostEl.getAttribute("api-key") || "";
      if (!embedToken) embedToken = hostEl.getAttribute('embed-token') || '';
      if (!componentId) componentId = hostEl.getAttribute("component-id") || "";
      if (!Object.keys(reportParams).length) {
        const rp = hostEl.getAttribute('report-params');
        if (rp) try { reportParams = JSON.parse(rp); } catch(e) {}
      }
      if (!testMode) {
        if (hostEl.getAttribute("clicks-filter") === "true") clicksFilter = true;
        const tm = hostEl.getAttribute("test-mode");
        if (tm === "true" || tm === "") testMode = true;
      }
    }

    if (width) container.style.width = String(width);
    if (height) container.style.height = String(height);

    // Self-fetch path: load config + data from the reporting REST API.
    if (reportId && apiBaseUrl) {
      selfFetchLoading = true;
      const headers: Record<string, string> = {};
      if (embedToken) headers['X-Embed-Token'] = embedToken;
      try {
        const config = await fetchConfigCached(`${apiBaseUrl}/reports/${reportId}/config`, headers);

        // Map-specific config lives under `mapOptions` (mirrors chartOptions).
        if (componentId && config.namedMapOptions?.[componentId]) {
          options = { ...config.namedMapOptions[componentId], ...options };
        } else if (config.mapOptions) {
          options = { ...config.mapOptions, ...options };
        }

        const qs = reportQuery(reportParams);
        if (testMode) qs.set("testMode", "true");
        if (componentId) qs.set("componentId", componentId);
        const dataUrl = qs.toString()
          ? `${apiBaseUrl}/reports/${reportId}/data?${qs.toString()}`
          : `${apiBaseUrl}/reports/${reportId}/data`;
        const res = await fetch(dataUrl, { headers });
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

    await renderMap();
  });

  let _dirty = 0;
  afterUpdate(async () => {
    // Re-render on data/options change. Debounce via a counter so we don't
    // queue a new render while one is in-flight.
    const tag = ++_dirty;
    await tick();
    if (tag !== _dirty) return;
    if (mapInstance) await renderMap();
  });

  onDestroy(() => {
    try { (mapInstance as any)?._rbResizeObserver?.disconnect(); } catch {}
    // A zoom still animating ends on a timer remove() does not cancel, and on the removed map it threw
    // from inside Leaflet (`_leaflet_pos` of undefined): a Cube Stories card removes its map when the
    // next answer is a table or a chart. Nothing is left to end once the map is gone.
    try { mapInstance?.stop(); if (mapInstance) (mapInstance as any)._onZoomTransitionEnd = () => {}; } catch {}
    try { mapInstance?.remove(); } catch {}
    mapInstance = null;
    layerGroup = null;
  });

  // Public reload method — useful from React when filters change.
  export async function reload(params: Record<string, string> = {}) {
    if (reportId && apiBaseUrl) {
      const qs = reportQuery({ ...reportParams, ...params });
      if (testMode) qs.set("testMode", "true");
      if (componentId) qs.set("componentId", componentId);
      const res = await fetch(`${apiBaseUrl}/reports/${reportId}/data?${qs.toString()}`, { headers: embedToken ? { 'X-Embed-Token': embedToken } : {} });
      if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
      const result = await res.json();
      data = Array.isArray(result) ? result : (result?.data ?? []);
    }
    await renderMap();
  }

</script>

<style>
  .rb-map-root {
    width: 100%;
    height: 100%;
    position: relative;
    min-height: 240px;
  }
  .rb-map-loading, .rb-map-error {
    padding: 1rem;
    text-align: center;
    font-size: 12px;
  }
  .rb-map-loading { color: var(--color-base-content, #666); }
  .rb-map-error { color: var(--color-error, #dc3545); background: var(--color-base-100, #fff5f5); border: 1px solid var(--color-error, #dc3545); border-radius: 4px; }
  /* Leaflet tiles should fill the container */
  :global(.leaflet-container) { background: transparent; font-family: inherit; }
  /* Overlay chrome (tooltips, popups, zoom controls) — Leaflet's CDN CSS hardcodes
     white surfaces + dark text. Theme them so they read against the host's palette.
     Data-feature colors (markers, choropleth, grid) are left untouched. */
  :global(.leaflet-tooltip),
  :global(.leaflet-popup-content-wrapper),
  :global(.leaflet-popup-tip) {
    background: var(--rb-surface, Canvas);
    color: inherit;
    border-color: var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
  }
  :global(.leaflet-tooltip) { font-size: 11px; }
  :global(.leaflet-bar a),
  :global(.leaflet-bar a:hover) {
    background: var(--rb-surface, Canvas);
    color: inherit;
    border-color: var(--rb-border, color-mix(in oklab, currentColor 18%, transparent));
  }
  /* Hide Leaflet / OpenStreetMap attribution without affecting map sizing —
     disabling attributionControl in map options triggered a Leaflet sizing regression. */
  :global(.leaflet-control-attribution) { display: none !important; }
</style>

{#if selfFetchLoading}
  <div class="rb-map-loading" id={componentId ? `widgetLoading-${componentId}` : undefined}>Loading map…</div>
{/if}
{#if error}
  <div class="rb-map-error" id={componentId ? `widgetError-${componentId}` : undefined}>{error}</div>
{/if}
<div
  class="rb-map-root"
  bind:this={container}
  id={componentId ? `widgetMap-${componentId}` : undefined}
  style:display={selfFetchLoading || error ? "none" : "block"}
  style:width={width ? String(width) : undefined}
  style:height={height ? String(height) : undefined}
></div>

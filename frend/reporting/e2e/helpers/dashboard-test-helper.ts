import { expect, type Locator, Page } from '@playwright/test';

/** Named component IDs used by the dashboard data API. */
export interface DashboardComponentIds {
  // Shipped g-dashboard sample: one multi-column component renders all 4 KPI values
  atomicValues?: string;
  // D21 reconstruction: four separate single-field KPI widgets
  revenue?: string;
  orders?: string;
  avgOrderValue?: string;
  customers?: string;
  revenueTrend: string;
  revenueByCategory: string;
  topCustomers: string;
  orderExplorer: string;
}

/** Default IDs used by the hand-written g-dashboard sample. */
const SAMPLE_IDS: DashboardComponentIds = {
  atomicValues:    'atomicValues',
  revenueTrend:    'revenueTrend',
  revenueByCategory: 'revenueByCategory',
  topCustomers:    'topCustomers',
  orderExplorer:   'orderExplorer',
};

/** What the page says it is: the title and a piece of the purpose line under it. */
export interface DashboardHeader {
  title: string;
  subtitle: string;
}

/** The shipped g-dashboard sample's own title and purpose line. */
const SAMPLE_HEADER: DashboardHeader = {
  title: 'Sales Performance',
  subtitle: 'revenue, orders and average order value',
};

/**
 * A widget's rows, asked as the page's own components ask: with the embed token the page holds, when it
 * was handed one. A desktop Try it opens the dashboard in a browser with no session, by a token only.
 */
async function widgetData(page: Page, reportCode: string, componentId: string, countryParam: string) {
  return page.evaluate(async ({ rc, cp, cid }) => {
    const token = document.getElementById(`dashboard-${rc}`)?.parentElement?.getAttribute('embed-token');
    const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`, {
      headers: token ? { 'X-Embed-Token': token } : {},
    });
    return resp.json();
  }, { rc: reportCode, cp: countryParam, cid: componentId });
}

/**
 * Shared dashboard assertion helper.
 *
 * When `componentIds` is omitted the function also validates the HTML template
 * (its title and purpose line, rb-value / rb-chart counts). The counts and the
 * default ids are the shipped g-dashboard sample's; a dashboard built to the same
 * layout but with its own wording passes its own `header`.
 *
 * When `componentIds` is provided the HTML template checks are skipped and the
 * data API is called with the supplied dynamic IDs instead. All data-level
 * assertions (revenue amounts, customer names, pivot rows …) are identical in
 * both code paths.
 *
 * When country is undefined, asserts unfiltered Northwind totals.
 * When country is provided (e.g. 'Germany'), asserts country-filtered data.
 */
export async function assertDashboardRendersCorrectly(
  page: Page,
  reportCode: string,
  country?: string,
  componentIds?: DashboardComponentIds,
  header: DashboardHeader = SAMPLE_HEADER,
) {
  const ids = componentIds ?? SAMPLE_IDS;
  const countryParam = country ? `&country=${encodeURIComponent(country)}` : '';

  // ── 1. Header & layout (g-dashboard sample HTML template only) ──
  if (!componentIds) {
    // The page says what it is for before it says anything else (D2).
    await expect(page.locator('#dashTitle')).toHaveText(header.title, { timeout: 30000 });
    await expect(page.locator('#dashSubtitle'))
      .toContainText(header.subtitle, { timeout: 10000 });
    // Each tile by its own id; the four numbers share one data call, so one component id.
    await expect(page.locator('[id="widgetValue-atomicValues"]')).toHaveCount(4, { timeout: 15000 });
    await expect(page.locator('[id="widgetChart-revenueTrend"]')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[id="widgetChart-revenueByCategory"]')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[id="widgetTabulator-topCustomers"]')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[id="widgetPivot-orderExplorer"]')).toHaveCount(1, { timeout: 15000 });
  }

  // ── 2. KPI cards ──
  if (ids.atomicValues) {
    // Shipped g-dashboard sample: single multi-column component
    const atomicData = await widgetData(page, reportCode, ids.atomicValues, countryParam);
    expect(atomicData.data).toBeDefined();
    expect(atomicData.data.length).toBe(1);
    const kpi = atomicData.data[0];
    if (!country) {
      expect(Math.round(Number(kpi.revenue))).toBe(58153);
      expect(Number(kpi.orders)).toBe(79);
      expect(Math.round(Number(kpi.avgOrderValue))).toBe(736);
      expect(Number(kpi.customers)).toBe(25);
    } else {
      expect(Number(kpi.revenue)).toBeGreaterThan(0);
      expect(Number(kpi.revenue)).toBeLessThan(58153);
      expect(Number(kpi.orders)).toBeGreaterThan(0);
      expect(Number(kpi.orders)).toBeLessThan(79);
      expect(Number(kpi.avgOrderValue)).toBeGreaterThan(0);
      expect(Number(kpi.customers)).toBeGreaterThan(0);
      expect(Number(kpi.customers)).toBeLessThan(25);
    }
  } else if (ids.revenue) {
    // D21 reconstruction: four separate single-field KPI widgets
    const fetchKpi = (cid: string) => widgetData(page, reportCode, cid, countryParam);

    const [revData, ordData, avgData, cusData] = await Promise.all([
      fetchKpi(ids.revenue!),
      fetchKpi(ids.orders!),
      fetchKpi(ids.avgOrderValue!),
      fetchKpi(ids.customers!),
    ]);

    const rev = Number(revData.data[0].revenue);
    const ord = Number(ordData.data[0].orders);
    const avg = Number(avgData.data[0].avgOrderValue);
    const cus = Number(cusData.data[0].customers);

    if (!country) {
      expect(Math.round(rev)).toBe(58153);
      expect(ord).toBe(79);
      expect(Math.round(avg)).toBe(736);
      expect(cus).toBe(25);
    } else {
      expect(rev).toBeGreaterThan(0);
      expect(rev).toBeLessThan(58153);
      expect(ord).toBeGreaterThan(0);
      expect(ord).toBeLessThan(79);
      expect(avg).toBeGreaterThan(0);
      expect(cus).toBeGreaterThan(0);
      expect(cus).toBeLessThan(25);
    }
  }

  // ── 3. Revenue trend chart (monthly) ──
  const revenueTrendData = await widgetData(page, reportCode, ids.revenueTrend, countryParam);
  expect(revenueTrendData.data).toBeDefined();
  expect(revenueTrendData.data.length).toBeGreaterThan(0);
  const trendRow = revenueTrendData.data[0];
  expect(trendRow.month).toBeDefined();
  expect(Number(trendRow.revenue)).toBeGreaterThan(0);

  if (!country) {
    expect(revenueTrendData.data.length).toBeGreaterThan(5); // 18 months of data
  }

  // ── 4. Revenue by category chart ──
  const categoryData = await widgetData(page, reportCode, ids.revenueByCategory, countryParam);
  expect(categoryData.data).toBeDefined();
  expect(categoryData.data.length).toBeGreaterThan(0);

  if (!country) {
    // All 8 product categories present when unfiltered
    expect(categoryData.data.length).toBe(8);
    const categories = categoryData.data.map((r: any) => r.category);
    expect(categories).toContain('Beverages');
    expect(categories).toContain('Dairy Products');
  }

  // ── 5. Top customers tabulator ──
  const topCustomersData = await widgetData(page, reportCode, ids.topCustomers, countryParam);
  expect(topCustomersData.data).toBeDefined();
  expect(topCustomersData.data.length).toBeGreaterThan(0);

  if (!country) {
    expect(topCustomersData.data.length).toBe(10); // top 10 limit
    // Known #1: Cactus Comidas para llevar, Argentina
    const top1 = topCustomersData.data[0];
    expect(top1.company).toBe('Cactus Comidas para llevar');
    expect(top1.country).toBe('Argentina');
    expect(top1.contact).toBe('Patricio Simpson');
    expect(Number(top1.orders)).toBe(3);
    expect(Number(top1.revenue)).toBeCloseTo(4567.80, 0);
    // Known #2: Blauer See Delikatessen
    expect(topCustomersData.data[1].company).toBe('Blauer See Delikatessen');
    expect(topCustomersData.data[1].country).toBe('Germany');
    // Known last (#10): LILA-Supermercado
    expect(topCustomersData.data[9].company).toBe('LILA-Supermercado');
    expect(topCustomersData.data[9].country).toBe('Venezuela');
  } else {
    // When filtered by country, ALL customers must be from that country
    for (const row of topCustomersData.data) {
      expect(row.country).toBe(country);
    }
    // Germany has 11 customers in the DB, so top 10 should be full
    if (country === 'Germany') {
      expect(topCustomersData.data.length).toBe(10);
      const companies = topCustomersData.data.map((r: any) => r.company);
      expect(companies).toContain('Alfreds Futterkiste');
      expect(companies).toContain('Blauer See Delikatessen');
    }
  }

  // ── 6. Order explorer pivot ──
  const pivotData = await widgetData(page, reportCode, ids.orderExplorer, countryParam);
  expect(pivotData.data).toBeDefined();
  expect(pivotData.data.length).toBeGreaterThan(0);
  const pivotRow = pivotData.data[0];
  expect(pivotRow.country).toBeDefined();
  expect(pivotRow.category).toBeDefined();
  expect(pivotRow.year).toBeDefined();
  expect(Number(pivotRow.revenue)).toBeGreaterThan(0);

  if (!country) {
    expect(pivotData.data.length).toBeGreaterThan(10); // many country x category x year combos
    // Germany has the highest total revenue
    const germanyRows = pivotData.data.filter((r: any) => r.country === 'Germany');
    expect(germanyRows.length).toBeGreaterThan(0);
    const germanyTotal = germanyRows.reduce((sum: number, r: any) => sum + Number(r.revenue), 0);
    expect(Math.round(germanyTotal)).toBeCloseTo(27256, -1); // ~27,256
  } else {
    // When filtered, ALL rows must be from the selected country
    for (const row of pivotData.data) {
      expect(row.country).toBe(country);
    }
  }
}

export type WidgetState = {
  id: string;
  type: string;
  displayConfig?: Record<string, unknown>;
  dataSource?: { visualQuery?: { table?: string } };
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * One property of a slicer, from the canonical DSL Map the canvas writes it in, falling
 * back to the flat key older canvases used. Mirrors `ScriptAssembler.slicerField` and
 * `slicerLabel`: a slicer whose field is read from the wrong place is published under
 * `slicer_<id>` and not `slicer_<field>_<id>`, so nothing finds it.
 */
function slicerDsl(dc: Record<string, unknown>, key: string, legacyKey: string): string {
  const dsl = dc.dslConfig as Record<string, unknown> | undefined;
  const fromDsl = dsl?.[key];
  if (typeof fromDsl === 'string' && fromDsl.trim()) return fromDsl;
  const legacy = dc[legacyKey];
  return typeof legacy === 'string' ? legacy : '';
}

function inferSemanticSlug(type: string, w: WidgetState): string {
  const dc = (w.displayConfig ?? {}) as Record<string, unknown>;
  // Primary: field/table name derived from data binding — most precise
  let raw = '';
  switch (type) {
    case 'number':      raw = (dc.numberField as string) ?? ''; break;
    case 'chart':       raw = ((dc.xFields as string[]) ?? [])[0] ?? ''; break;
    case 'tabulator':   raw = w.dataSource?.visualQuery?.table ?? ''; break;
    case 'pivot':       raw = ((dc.pivotRows as string[]) ?? [])[0] ?? ''; break;
    case 'slicer': raw = slicerDsl(dc, 'field', 'filterField'); break;
    case 'gauge':       raw = (dc.field as string) ?? ''; break;
    case 'trend':       raw = (dc.dateField as string) ?? ''; break;
    case 'sankey':      raw = (dc.sourceField as string) ?? ''; break;
  }
  if (raw) return slugify(raw);
  // Fallback: user-provided title/label — semantic because the user chose it
  let label = '';
  switch (type) {
    case 'number':      label = (dc.numberLabel     as string) ?? ''; break;
    case 'chart':       label = (dc.chartTitle      as string) ?? ''; break;
    case 'slicer': label = slicerDsl(dc, 'label', 'slicerLabel'); break;
    case 'gauge':       label = (dc.label           as string) ?? ''; break;
    case 'trend':       label = (dc.label           as string) ?? ''; break;
  }
  return label ? slugify(label) : '';
}

/**
 * Fetches the canvas state from the API and computes ScriptAssembler's componentId
 * for each widget type. Returns arrays (insertion order) so multiple widgets of the
 * same type are supported (e.g. two chart widgets).
 *
 * Formula mirrors ScriptAssembler.componentId() and DashboardFileGenerator.componentId():
 * - With semantic slug:    `${type}_${slug}_${suffix}` (suffix = last dash-segment of stripped id)
 * - Without semantic slug: `${type}_${stripped}` (fallback)
 */
export async function getCanvasComponentIds(
  page: Page,
  canvasId: string,
): Promise<Record<string, string[]>> {
  const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
  const canvas: { state: string } = await response.json();
  const state = JSON.parse(canvas.state);
  const ids: Record<string, string[]> = {};
  for (const w of state.widgets as WidgetState[]) {
    if (!ids[w.type]) ids[w.type] = [];
    ids[w.type].push(canvasComponentId(w));
  }
  return ids;
}

/** The id a published tile of each widget type is drawn under: `<prefix>-<its component id>`. */
export const PUBLISHED_TILE_ID: Record<string, string> = {
  number: 'widgetValue',
  trend: 'widgetTrend',
  gauge: 'widgetGauge',
  progress: 'widgetProgress',
  chart: 'widgetChart',
  tabulator: 'widgetTabulator',
  pivot: 'widgetPivot',
  map: 'widgetMap',
  sankey: 'widgetSankey',
  detail: 'widgetDetail',
};

/** A published tile, by the component id of the canvas widget it was published from. */
export function publishedTile(page: Page, type: string, componentId: string): Locator {
  return page.locator(`[id="${PUBLISHED_TILE_ID[type]}-${componentId}"]`);
}

/**
 * The published page is up and draws the tiles it was published with: `#publishedDashboard`, then,
 * for each widget type in `expected`, exactly that many tiles of the type on the page, each one a
 * widget of the canvas (`ids`, from `getCanvasComponentIds`) drawn under its own id.
 */
export async function expectPublishedTiles(
  page: Page,
  ids: Record<string, string[]>,
  expected: Record<string, number>,
): Promise<void> {
  await expect(page.locator('#publishedDashboard')).toBeVisible({ timeout: 15_000 });
  for (const [type, count] of Object.entries(expected)) {
    const prefix = PUBLISHED_TILE_ID[type];
    expect(ids[type] ?? [], `the canvas has ${count} ${type} widget(s)`).toHaveLength(count);
    await expect(page.locator(`#publishedDashboard [id^="${prefix}-"]`), `${count} ${type} tile(s) on the page`)
      .toHaveCount(count, { timeout: 20_000 });
    for (const componentId of ids[type] ?? [])
      await expect(publishedTile(page, type, componentId), `the ${type} tile ${componentId}`)
        .toBeVisible({ timeout: 20_000 });
  }
}

/**
 * The name a canvas widget's own files call it, which is the `component-id` in the published
 * template and the key its rows come back under.
 *
 * The formula lives here, in one place: `getCanvasComponentIds` above reads it off a running
 * server, and the Dashboard Demos read it off the shipped `.canvas.json` with no server at all
 * (`helpers/dashboard-demos/demo-catalog.ts`). Both must be the same name the dashboard uses, so
 * neither may carry a copy of the rule.
 */
export function canvasComponentId(w: WidgetState): string {
  const stripped = w.id.replace(/^w-/, '');
  const slug = inferSemanticSlug(w.type, w);
  return slug
    ? `${w.type}_${slug}_${stripped.substring(stripped.lastIndexOf('-') + 1)}`
    : `${w.type}_${stripped}`;
}

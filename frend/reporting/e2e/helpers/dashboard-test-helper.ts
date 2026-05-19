import { expect, Page } from '@playwright/test';

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

/**
 * Shared dashboard assertion helper.
 *
 * When `componentIds` is omitted the function also validates the HTML template
 * ("Northwind Sales Dashboard" text, rb-value / rb-chart counts) — this is only
 * meaningful for the shipped g-dashboard sample whose HTML template is fixed.
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
) {
  const ids = componentIds ?? SAMPLE_IDS;
  const countryParam = country ? `&country=${encodeURIComponent(country)}` : '';

  // ── 1. Header & layout (g-dashboard sample HTML template only) ──
  if (!componentIds) {
    await expect(page.locator('text=Northwind Sales Dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('text=Wholesale distribution')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('rb-value')).toHaveCount(4, { timeout: 15000 });
    await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 15000 });
  }

  // ── 2. KPI cards ──
  if (ids.atomicValues) {
    // Shipped g-dashboard sample: single multi-column component
    const atomicData = await page.evaluate(async ({ rc, cp, cid }) => {
      const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`);
      return resp.json();
    }, { rc: reportCode, cp: countryParam, cid: ids.atomicValues });
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
    const fetchKpi = async (cid: string) => page.evaluate(async ({ rc, cp, id }) => {
      const resp = await fetch(`/api/reports/${rc}/data?componentId=${id}${cp}`);
      return resp.json();
    }, { rc: reportCode, cp: countryParam, id: cid });

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
  const revenueTrendData = await page.evaluate(async ({ rc, cp, cid }) => {
    const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`);
    return resp.json();
  }, { rc: reportCode, cp: countryParam, cid: ids.revenueTrend });
  expect(revenueTrendData.data).toBeDefined();
  expect(revenueTrendData.data.length).toBeGreaterThan(0);
  const trendRow = revenueTrendData.data[0];
  expect(trendRow.month).toBeDefined();
  expect(Number(trendRow.revenue)).toBeGreaterThan(0);

  if (!country) {
    expect(revenueTrendData.data.length).toBeGreaterThan(5); // 18 months of data
  }

  // ── 4. Revenue by category chart ──
  const categoryData = await page.evaluate(async ({ rc, cp, cid }) => {
    const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`);
    return resp.json();
  }, { rc: reportCode, cp: countryParam, cid: ids.revenueByCategory });
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
  const topCustomersData = await page.evaluate(async ({ rc, cp, cid }) => {
    const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`);
    return resp.json();
  }, { rc: reportCode, cp: countryParam, cid: ids.topCustomers });
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
  const pivotData = await page.evaluate(async ({ rc, cp, cid }) => {
    const resp = await fetch(`/api/reports/${rc}/data?componentId=${cid}${cp}`);
    return resp.json();
  }, { rc: reportCode, cp: countryParam, cid: ids.orderExplorer });
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

type WidgetState = {
  id: string;
  type: string;
  displayConfig?: Record<string, unknown>;
  dataSource?: { visualQuery?: { table?: string } };
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
    case 'filter-pane': raw = (dc.filterField as string) ?? ''; break;
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
    case 'filter-pane': label = (dc.filterPaneLabel as string) ?? ''; break;
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
  const response = await page.request.get(`http://localhost:9090/api/explore-data/${canvasId}`);
  const canvas: { state: string } = await response.json();
  const state = JSON.parse(canvas.state);
  const ids: Record<string, string[]> = {};
  for (const w of state.widgets as WidgetState[]) {
    const stripped = w.id.replace(/^w-/, '');
    const slug = inferSemanticSlug(w.type, w);
    const compId = slug
      ? `${w.type}_${slug}_${stripped.substring(stripped.lastIndexOf('-') + 1)}`
      : `${w.type}_${stripped}`;
    if (!ids[w.type]) ids[w.type] = [];
    ids[w.type].push(compId);
  }
  return ids;
}

import { expect, type Page } from '@playwright/test';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType =
  | 'chart' | 'tabulator' | 'pivot' | 'number'
  | 'map'   | 'sankey'   | 'gauge' | 'trend'
  | 'progress' | 'detail';

/** How text is delivered into CodeMirror editors.
 *   - "paste" (default): keyboard.insertText() — single input event, no per-char slowMo cost.
 *   - "typed": paste all but the last 2 chars, then type the last 2 char-by-char.
 *     Exercises the keystroke path for one representative assertion per suite. */
export type EditorInputMode = 'paste' | 'typed';

// ── Constants ─────────────────────────────────────────────────────────────────

export const WEB_COMPONENT: Record<WidgetType, string> = {
  tabulator: 'rb-tabulator',
  chart:     'rb-chart',
  pivot:     'rb-pivot-table',
  number:    'rb-value',
  map:       'rb-map',
  sankey:    'rb-sankey',
  gauge:     'rb-gauge',
  trend:     'rb-trend',
  progress:  'rb-progress',
  detail:    'rb-detail',
};

// ── Connection helpers ────────────────────────────────────────────────────────

/** Mirrors ConnectionsTestHelper.createAndAssertNewDatabaseConnection's code formula. */
export function toConnectionCode(connectionName: string, vendor: string): string {
  const slug = connectionName
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return `db-${slug}-${vendor}`;
}

/** Select a DB connection by name + vendor and wait for the schema to load. */
export async function selectConnection(
  page: Page,
  connectionName: string,
  vendor: string,
): Promise<void> {
  await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#selectConnection').selectOption(toConnectionCode(connectionName, vendor));
  await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
}

// ── Canvas lifecycle helpers ──────────────────────────────────────────────────

/** Navigate to the canvas list, create a fresh canvas, and optionally rename it.
 *  Does NOT select a connection — call selectConnection() afterwards. */
export async function createFreshCanvas(
  page: Page,
  canvasUrl: string,
  name?: string,
): Promise<void> {
  await page.goto(canvasUrl);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.locator('#btnNewCanvas').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#btnNewCanvas').click();
  await page.waitForURL(/\/explore-data\/[^/]+$/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
  if (name) {
    await page.locator('#btnCanvasName').click();
    await page.locator('#txtDashboardName').waitFor({ state: 'visible', timeout: 3_000 });
    await page.locator('#txtDashboardName').fill(name);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }
}

/** Click a table in SchemaBrowser and confirm "Yes" to add it to the canvas.
 *  Uses attribute selector so table names with spaces (e.g. "Order Details") work. */
export async function addTableToCanvas(page: Page, tableName: string): Promise<void> {
  await page.locator(`[id="btnTable-${tableName}"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`[id="btnTable-${tableName}"]`).click();
  await page.locator(`[id="btnConfirmAdd-${tableName}"]`).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator(`[id="btnConfirmAdd-${tableName}"]`).click();
  // Staged wait for the right-panel's "Visualize as" section.
  //
  // Why three steps instead of one `waitFor({ state: 'visible' })`:
  // Adding a table fans out four parallel backend calls (schema fetch ×N,
  // probeSemanticType) and triggers a burst of rb-tabulator afterUpdate
  // cycles plus 6+ ConfigPanel renders. In long test runs (10 widgets ×
  // multiple SQL queries each) those costs accumulate — the per-test gap
  // grows from ~10s on A-1 to 40s+ on A-5 — and a single `visible` waiter
  // can hit its timeout while the React commit → paint → CDP-snapshot
  // pipeline is still draining, even though no app-level bug is present.
  //
  // 1. `attached` resolves the moment React commits the subtree (cheap signal,
  //    independent of layout/paint work competing for the main thread).
  // 2. `networkidle` (best-effort, .catch swallows the timeout) drains the
  //    parallel-fetch queue so paint can catch up.
  // 3. `visible` with a 30s budget then verifies layout/CSS settled — wide
  //    enough to cover worst-case load amplification we've measured here.
  await page.locator('#visualizeAsSection').waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.locator('#visualizeAsSection').waitFor({ state: 'visible', timeout: 30_000 });
  // Adding a table auto-fires an implicit `SELECT * FROM <table> LIMIT 500`
  // query in the widget. If the test switches to the Finetune tab and clicks
  // Run before that implicit query has settled, the widget's `loading=true`
  // state leaks into the Finetune Run button ("Running…") and can race with
  // the subsequent user query. Wait for the implicit query to finish.
  await page.waitForTimeout(1500);
}

/** Click a cube in SchemaBrowser and confirm "Yes" to add it as a cube-backed
 *  widget. The new widget defaults to the `pivot` type and renders the
 *  rb-cube-renderer in the query-builder panel; use selectCubeFields next
 *  to pick dimensions/measures, then optionally switchToWidget to change type. */
export async function addCubeToCanvas(page: Page, cubeId: string): Promise<void> {
  await page.locator(`[id="btnCube-${cubeId}"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`[id="btnCube-${cubeId}"]`).click();
  await page.locator(`[id="btnConfirmAddCube-${cubeId}"]`).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator(`[id="btnConfirmAddCube-${cubeId}"]`).click();
  // Staged wait — see addTableToCanvas for rationale.
  await page.locator('#visualizeAsSection').waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.locator('#visualizeAsSection').waitFor({ state: 'visible', timeout: 30_000 });
  // Wait for the rb-cube-renderer to load and parse the cube DSL.
  await page.locator('rb-cube-renderer').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1_500);
}

/** Synthesize a `selectionChanged` event on the rb-cube-renderer for the
 *  currently-selected widget. VisualQueryBuilder listens for this event and
 *  calls generateCubeSql with the chosen dimensions/measures, which updates
 *  the widget's generatedSql and triggers a data refresh. Dispatching the
 *  event directly avoids needing to drive the cube renderer's internal
 *  shadow-DOM checkbox UI. */
export async function selectCubeFields(
  page: Page,
  dimensions: string[],
  measures: string[],
): Promise<void> {
  await page.locator('rb-cube-renderer').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(({ dims, meas }) => {
    const el = document.querySelector('rb-cube-renderer');
    if (!el) throw new Error('rb-cube-renderer not found');
    el.dispatchEvent(new CustomEvent('selectionChanged', {
      detail: {
        selectedDimensions: dims,
        selectedMeasures: meas,
        selectedSegments: [],
      },
    }));
  }, { dims: dimensions, meas: measures });
  // generateCubeSql round-trip + useWidgetData query + render.
  await page.waitForTimeout(3_000);
}

/** Add a UI element (text block, divider, iframe) as a self-contained operation.
 *  Switches the left panel to the "UI Elements" tab, adds the element, optionally
 *  fills text content, then switches back to the "Data Source" tab so the main
 *  table-driven flow is uninterrupted. Adding a UI element is a secondary flow
 *  and should never leave the panel in a state that breaks subsequent
 *  `addTableToCanvas` / `addWidget` calls. */
export async function addUIElement(
  page: Page,
  type: 'text' | 'divider' | 'iframe',
  options?: { textContent?: string },
): Promise<void> {
  await page.click('#btnLeftTabElements');
  await page.click(`#btnAddElement-${type}`);
  if (options?.textContent !== undefined) {
    await page.locator('#txtWidgetTextContent').fill(options.textContent);
  }
  await page.click('#btnLeftTabData');
}

// ── Editor helpers ────────────────────────────────────────────────────────────

/** Type text into the focused CodeMirror editor.
 *  "paste" (default) issues a single insertText — no per-char slowMo cost.
 *  "typed" pastes all but the last 2 chars then types the remainder char-by-char. */
export async function enterTextIntoEditor(
  page: Page,
  text: string,
  mode: EditorInputMode = 'paste',
): Promise<void> {
  if (mode === 'typed' && text.length > 2) {
    await page.keyboard.insertText(text.slice(0, -2));
    await page.keyboard.type(text.slice(-2));
  } else {
    await page.keyboard.insertText(text);
  }
}

/** Switch to the Finetune SQL tab, select SQL mode, replace the editor content,
 *  then click Run Query. Does NOT click Detect Columns — call detectColumns() if needed. */
export async function runSqlQuery(
  page: Page,
  sql: string,
  inputMode: EditorInputMode = 'paste',
): Promise<void> {
  await page.locator('#btnQueryTab-finetune').click();
  await page.waitForTimeout(500);
  await page.locator('#selectQueryMode').selectOption('sql');
  await page.waitForTimeout(300);
  const editor = page.locator('#sqlEditorContainer .cm-content');
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
  await editor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, sql, inputMode);
  // Dismiss any CodeMirror autocomplete popup left visible after typing
  // (e.g. the keyword popover that fires on "DESC", "ORDER", "SELECT").
  // If the popup is still on screen when we click Run, the click is
  // intercepted by the popup overlay and the test hangs at this point —
  // exactly the behavior the user observed (manually clicking the editor
  // unblocked it because that click dismissed the popover).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('#btnRunSqlQuery').click();
  await page.waitForTimeout(2_000);
}

/** Switch to the Finetune tab, select Script mode, replace the editor content,
 *  then click Run Script. Mirrors runSqlQuery but targets the Groovy mode IDs
 *  (scriptEditorContainer / btnRunScript / selectQueryMode='script'). The script
 *  should return a List<Map> — typically `ctx.dbSql.rows(sql)` then `return data`. */
export async function runGroovyScript(
  page: Page,
  script: string,
  inputMode: EditorInputMode = 'paste',
): Promise<void> {
  await page.locator('#btnQueryTab-finetune').click();
  await page.waitForTimeout(500);
  await page.locator('#selectQueryMode').selectOption('script');
  await page.waitForTimeout(300);
  const editor = page.locator('#scriptEditorContainer .cm-content');
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
  await editor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, script, inputMode);
  // Same autocomplete-dismiss as runSqlQuery — the Groovy mode editor
  // also pops keyword/identifier completions while typing.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('#btnRunScript').click();
  await page.waitForTimeout(2_000);
}

/** Switch to the Display tab and click Detect Columns to infer columns from the current SQL. */
export async function detectColumns(page: Page): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(300);
  await page.locator('#btnDetectColumns').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnDetectColumns').click();
  await page.waitForTimeout(3_000);
}

/** Open the DSL editor and wait for its serialize-driven content to populate.
 *
 *  Normalizes state first: if the editor is already open (e.g. sticky from a
 *  previous widget's setCustomWidgetDsl call), close it before opening — so
 *  the subsequent open triggers a fresh mount tied to the currently-selected
 *  widget. Without this, sequential setCustomWidgetDsl calls across multiple
 *  widgets (e.g. D21's 4 custom-DSL widgets) leave the editor bound to the
 *  previous widget's content; waitForFunction returns immediately against
 *  stale text and any typed DSL lands in the wrong context.
 *
 *  The serialize API is async — the container becomes visible before content
 *  arrives, so we waitForFunction on .cm-content being non-empty. */
export async function openDslEditor(
  page: Page,
  container: string = '#dslEditorContainer',
): Promise<void> {
  const toggle = page.locator('#btnDslToggle');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.waitFor({ state: 'visible', timeout: 5_000 });

  // If already open (sticky from previous widget), close first to force a
  // clean re-mount on the subsequent open click.
  if (await page.locator(container).isVisible().catch(() => false)) {
    await toggle.click();
    await page.locator(container).waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  // Open fresh.
  await toggle.click();
  await page.waitForTimeout(500);
  await page.locator(container).waitFor({ state: 'visible', timeout: 5_000 });

  // Wait for the serialize API to populate .cm-content — fresh open means
  // this waits for the current widget's DSL, not a stale previous value.
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel + ' .cm-content');
      return el !== null && (el.textContent ?? '').trim().length > 0;
    },
    container,
    { timeout: 10_000 },
  );
}

// ── Widget helpers ────────────────────────────────────────────────────────────

/** Switch the canvas to the given widget type via the palette (main grid or More widgets).
 *  No-op if the widget already is the target type — the palette hides the current
 *  type's button (can't switch to self), which also happens when the canvas
 *  auto-switched the fresh tabulator to e.g. `number` because the SQL returned a
 *  single scalar. Rather than fail, confirm the button is absent in BOTH grids and
 *  assume auto-switch has already landed us on the target. */
export async function switchToWidget(page: Page, widgetType: WidgetType): Promise<void> {
  const mainCount = await page.locator(`#visualizeAsGrid #btnVisualizeAs-${widgetType}`).count();
  if (mainCount > 0) {
    await page.locator(`#visualizeAsGrid #btnVisualizeAs-${widgetType}`).click();
    await page.waitForTimeout(1_000);
    return;
  }

  await page.locator('#btnMoreWidgets').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnMoreWidgets').click();
  await page.waitForTimeout(300);

  const moreBtn = page.locator(`#moreWidgetsGrid #btnVisualizeAs-${widgetType}`);
  if (await moreBtn.count() > 0) {
    await moreBtn.click();
    await page.waitForTimeout(1_000);
    return;
  }

  // Button absent in both grids → widget auto-switched to the target type already.
  // Close the More Widgets popover so the next helper call starts from a clean state.
  await page.locator('#btnMoreWidgets').click();
  await page.waitForTimeout(300);
}

export async function clickDisplayTab(page: Page): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.waitForTimeout(500);
}

export async function clickDataTab(page: Page): Promise<void> {
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Assert the widget's primary web component is visible in the canvas. */
export async function assertWidgetRenders(page: Page, widgetType: WidgetType): Promise<void> {
  const el = page.locator(WEB_COMPONENT[widgetType]).first();
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(el).toBeVisible();
}

/** Click the widget header strip (16px above the web component) to select the widget.
 *  Direct locator.click() fails because react-grid-drag-handle absorbs events — real
 *  OS-level mouse events via page.mouse bypass that. */
export async function clickWidgetHeader(page: Page, widgetType: WidgetType): Promise<void> {
  const wc = page.locator(WEB_COMPONENT[widgetType]).first();
  await wc.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await wc.boundingBox();
  if (!box) throw new Error(`[clickWidgetHeader] bounding box null for ${widgetType}`);
  const cx = box.x + box.width / 2;
  const cy = box.y - 16;
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(100);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(500);
}

// ── Summarize / Visual-query helpers ─────────────────────────────────────────

/** Add one aggregation row in the Summarize UI. */
export async function addAggregation(
  page: Page,
  index: number,
  func: string,
  field: string,
): Promise<void> {
  await page.locator('#btnAddAggregation').click();
  await page.locator(`#selectAggFunc-${index}`).selectOption(func);
  await page.locator(`#selectAggField-${index}`).selectOption(field);
  await page.waitForTimeout(300);
}

/** Click a group-by chip button — fails hard if not found. */
export async function addGroupBy(page: Page, col: string): Promise<void> {
  const btn = page.locator(`#btnGroupBy-${col}`);
  await btn.waitFor({ state: 'visible', timeout: 5_000 });
  await btn.click();
  await page.waitForTimeout(300);
}

/** Switch to Visual tab and pick a table via the cmdk popover picker. */
export async function pickVisualTable(page: Page, tableName: string): Promise<void> {
  await page.locator('#btnQueryTab-visual').click();
  await page.waitForTimeout(500);
  await page.locator('#btnPickTableOrCube').click();
  await page.waitForTimeout(300);
  await page.locator(`[id="itemPickTable-${tableName}"]`).click();
  await page.waitForTimeout(500);
}

/** Switch to Visual tab and pick a cube via the cmdk popover picker. */
export async function pickVisualCube(page: Page, cubeId: string): Promise<void> {
  await page.locator('#btnQueryTab-visual').click();
  await page.waitForTimeout(500);
  await page.locator('#btnPickTableOrCube').click();
  await page.waitForTimeout(300);
  await page.locator(`[id="itemPickCube-${cubeId}"]`).click();
  await page.waitForTimeout(500);
}

/** Click the Visual "Run Query" button and wait for results to settle. */
export async function runVisualQuery(page: Page): Promise<void> {
  await page.locator('#btnRunQuery').click();
  await page.waitForTimeout(2_000);
}

/** Add one sort row in the Visual SortStep UI: pick a column and direction. */
export async function addVisualSort(
  page: Page,
  index: number,
  column: string,
  direction: 'ASC' | 'DESC' = 'ASC',
): Promise<void> {
  await page.locator('#btnAddSort').click();
  await page.locator(`#selectSortCol-${index}`).selectOption(column);
  await page.locator(`#selectSortDir-${index}`).selectOption(direction);
  await page.waitForTimeout(300);
}

/** Add one filter row in the Visual FilterStep UI: pick a column, operator, and value.
 *  Omit `value` for the no-value operators (is_null / is_not_null). */
export async function addVisualFilter(
  page: Page,
  index: number,
  column: string,
  operator: string,
  value?: string,
): Promise<void> {
  await page.locator('#btnAddFilter').click();
  await page.locator(`#selectFilterCol-${index}`).selectOption(column);
  await page.locator(`#selectFilterOp-${index}`).selectOption(operator);
  if (value !== undefined) {
    await page.locator(`#inputFilterValue-${index}`).fill(value);
  }
  await page.waitForTimeout(300);
}

/** Bind the filter row at `index` to a dashboard filter parameter (\${paramId}).
 *  Uses the `${}` chip in FilterStep: single-param → btnBindParam-${index};
 *  multi-param → selectBindParam-${index}. The operator must be param-bindable
 *  (equals / not_equals / numeric comparisons); `between` and LIKE-family are not.
 *  Call AFTER addVisualFilter with a compatible operator (do NOT pass a value). */
export async function bindVisualFilterToParam(
  page: Page,
  index: number,
  paramId: string,
): Promise<void> {
  const singleBtn = page.locator(`#btnBindParam-${index}`);
  const multiSel  = page.locator(`#selectBindParam-${index}`);
  if (await singleBtn.count() > 0) {
    await singleBtn.click();
  } else {
    await multiSel.selectOption(paramId);
  }
  await page.waitForTimeout(300);
}

/** Set the row Limit on the Visual query builder. Default is 500; tests that
 *  want top-N tables (e.g. Top 5 Winners) override it here. The input is in
 *  VisualQueryBuilder.tsx — `<input type="number" id="inputLimit" min={1} max={10000}>`. */
export async function setVisualLimit(page: Page, n: number): Promise<void> {
  const input = page.locator('#inputLimit');
  await input.waitFor({ state: 'visible', timeout: 5_000 });
  await input.click();
  await input.fill(String(n));
  await page.waitForTimeout(300);
}

/** Hide the named columns in the current Tabulator widget. Drives the
 *  Display tab's column-toggle UI:
 *   - opens the Display tab (`#btnDisplayTab`)
 *   - clicks `#btnToggleCol-${col}` for each column in `colsToHide`,
 *     skipping if `data-hidden="true"` already (idempotent)
 *   - returns to the Data tab (`#btnDataTab`)
 *
 *  Each toggle button has id `btnToggleCol-${columnName}` and a
 *  `data-hidden="true|false"` attribute per TabulatorConfig.tsx. */
export async function hideTabulatorColumns(
  page: Page,
  colsToHide: string[],
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  // Dispatch native DOM clicks via page.evaluate, bypassing Playwright's
  // actionability checks. ConfigPanel re-renders on every toggle break the
  // "stable" check and stall .click() for minutes; force:true only fixes part
  // of that (it still does a visibility lookup). A direct .click() on the DOM
  // node fires the React synthetic event regardless of viewport/scroll/stability.
  const domClick = async (elId: string): Promise<boolean> =>
    page.evaluate((id) => {
      const el = document.getElementById(id) as HTMLElement | null;
      if (!el) return false;
      el.click();
      return true;
    }, elId);

  // Playwright .click() works fine for the tab switch (~870ms in prior traces) —
  // ConfigPanel's tab buttons aren't subject to the stability-thrash that breaks
  // column-toggle clicks. Use force:true so any pending re-render can't intercept.
  await page.locator('#btnDisplayTab').click({ force: true, timeout: 5_000 });
  await page.waitForTimeout(300);
  // selectedWidget.columns is populated async (separate from rb-tabulator
  // appearing in DOM), so even after activeTab flips to "display",
  // TabulatorConfig may still render the empty-columns placeholder for a moment.
  // Wait for the first column toggle button to actually appear before clicking.
  if (colsToHide.length > 0) {
    try {
      await page.waitForFunction(
        (firstCol) => !!document.getElementById(`btnToggleCol-${firstCol}`),
        colsToHide[0],
        { timeout: 15_000 },
      );
    } catch (e) {
      const snapshot = await page.evaluate(() => {
        const btnDataTab = document.getElementById('btnDataTab');
        const btnDisplayTab = document.getElementById('btnDisplayTab');
        const widgetEl = document.querySelector('[id^="widget-"][class*="ring-2"]');
        const widgetId = widgetEl?.id ?? null;
        const rbTab = document.querySelector('rb-tabulator');
        const allToggleBtns = Array.from(document.querySelectorAll('[id^="btnToggleCol-"]')).map((b) => b.id);
        const visualizeAs = document.getElementById('visualizeAsSection');
        const allBtnDataTab = btnDataTab?.outerHTML?.slice(0, 200);
        const allBtnDisplayTab = btnDisplayTab?.outerHTML?.slice(0, 200);
        return {
          hasBtnDataTab: !!btnDataTab,
          hasBtnDisplayTab: !!btnDisplayTab,
          btnDataTabHTML: allBtnDataTab,
          btnDisplayTabHTML: allBtnDisplayTab,
          selectedWidgetId: widgetId,
          hasRbTabulator: !!rbTab,
          toggleBtnIds: allToggleBtns,
          hasVisualizeAsSection: !!visualizeAs,
          configPanelText: document.querySelector('#visualizeAsSection')?.parentElement?.textContent?.slice(0, 400),
        };
      });
      throw new Error(
        `hideTabulatorColumns: #btnToggleCol-${colsToHide[0]} never appeared. Diagnostic:\n${JSON.stringify(snapshot, null, 2)}`,
      );
    }
  }

  for (const col of colsToHide) {
    const id = `btnToggleCol-${col}`;
    const alreadyHidden = await page.evaluate(
      (elId) => document.getElementById(elId)?.getAttribute('data-hidden') === 'true',
      id,
    );
    if (alreadyHidden) continue;
    if (!(await domClick(id))) {
      throw new Error(`hideTabulatorColumns: #${id} not in DOM`);
    }
    await page.waitForTimeout(80);
  }

  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click({ force: true, timeout: 5_000 });
  await page.waitForTimeout(300);
}

// ── Layout helpers ────────────────────────────────────────────────────────────

/** A grid rectangle on the 12-col react-grid-layout canvas. */
export interface GridPos { x: number; y: number; w: number; h: number; }

/**
 * Arrange widgets on the canvas — simulates what a user would produce via
 * drag + resize on the react-grid-layout. Fetches the current canvas state,
 * assigns the given `gridPosition` to each widget in insertion order, and
 * PATCHes the state back via the canvas API.
 *
 * Fast + deterministic. Pass one GridPos per widget; length must match the
 * number of widgets on the canvas or the helper throws.
 */
/**
 * Layout widgets the way a real user would: grab each widget's bottom-right
 * resize handle (.react-resizable-handle) to set its size, then drag its
 * header to move it into position. Deltas are computed against the live
 * bounding-box so react-grid-layout's own snapping does the final placement.
 *
 * Targets must be passed in widget insertion order (the DOM order of the
 * GridLayout items). Works entirely through mouse events — you can watch
 * the drags happen while the test runs.
 */
export async function layoutWidgetsByDrag(
  page: Page,
  targets: GridPos[],
): Promise<void> {
  // Let any post-addWidget autosave settle before we start dragging.
  await page.waitForTimeout(1_200);

  // Scroll to top so gridBox.y is stable. Without this, if the page scrolled
  // to show a newly-added bottom widget, gridBox.y is negative and upward drags
  // compute target coordinates above the viewport, causing an infinite scroll loop.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // Grid geometry — mirror the values hard-coded in Canvas.tsx.
  const COLS    = 12;
  const ROW_H   = 80;
  const MARGIN  = 12;

  const grid = page.locator('.react-grid-layout').first();
  const gridBox = await grid.boundingBox();
  if (!gridBox) throw new Error('layoutWidgetsByDrag: grid container not found');
  const colW = (gridBox.width - MARGIN * (COLS - 1)) / COLS;

  const toPxW = (w: number) => w * colW + (w - 1) * MARGIN;
  const toPxH = (h: number) => h * ROW_H + (h - 1) * MARGIN;
  const toPxX = (x: number) => gridBox.x + x * (colW + MARGIN);
  const toPxY = (y: number) => gridBox.y + y * (ROW_H + MARGIN);

  const handles = await page.locator('[id^="widgetDragHandle-"]').all();
  if (handles.length !== targets.length) {
    throw new Error(
      `layoutWidgetsByDrag: ${handles.length} widgets on canvas but ${targets.length} targets`,
    );
  }

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    const t = targets[i];

    // ── Resize by delta: drag .react-resizable-handle by (Δw, Δh) in px ──
    const pre = await handle.boundingBox();
    if (!pre) continue;
    const resize = handle.locator('.react-resizable-handle').first();
    const rBox = await resize.boundingBox();
    if (rBox) {
      const deltaW = toPxW(t.w) - pre.width;
      const deltaH = toPxH(t.h) - pre.height;
      const sx = rBox.x + rBox.width  / 2;
      const sy = rBox.y + rBox.height / 2;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + deltaW, sy + deltaH, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    // ── Move by delta: grab the widget header, drag by (Δx, Δy) in px ──
    const post = await handle.boundingBox();
    if (!post) continue;
    const dx = toPxX(t.x) - post.x;
    const dy = toPxY(t.y) - post.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      const grabX = post.x + 40;
      const grabY = post.y + 14;
      await page.mouse.move(grabX, grabY);
      await page.mouse.down();
      await page.mouse.move(grabX + dx, grabY + dy, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
  }

  // Safety: release mouse and wait for ReactGridLayout drag overlay to clear.
  await page.mouse.up();
  await page.locator('.react-grid-placeholder').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

  // Wait for the debounced autosave to persist the final layout before publish.
  await page.waitForTimeout(1_500);
}

export async function arrangeWidgets(
  page: Page,
  canvasId: string,
  layouts: GridPos[],
): Promise<void> {
  // Wait for any pending autosave debounce (1200 ms) so our PUT doesn't
  // collide with a post-addWidget autosave flush.
  await page.waitForTimeout(1_500);

  // Absolute URL — the canvas API lives on the Java backend (9090), not on
  // the Next.js app (8440) where the page itself is served.
  const API = 'http://localhost:9090/api';
  await page.evaluate(async ({ cid, ls, api }) => {
    const getResp = await fetch(`${api}/explorations/${cid}`);
    if (!getResp.ok) throw new Error(`GET canvas ${cid} failed: ${getResp.status}`);
    const canvas = await getResp.json();
    const state = JSON.parse(canvas.state);
    const widgets = state.widgets as Array<{ gridPosition: unknown }>;
    if (widgets.length !== ls.length) {
      throw new Error(`arrangeWidgets: ${widgets.length} widgets but ${ls.length} layouts`);
    }
    for (let i = 0; i < widgets.length; i++) widgets[i].gridPosition = ls[i];

    const putResp = await fetch(`${api}/explorations/${cid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: JSON.stringify(state) }),
    });
    if (!putResp.ok) throw new Error(`PUT canvas ${cid} failed: ${putResp.status}`);
  }, { cid: canvasId, ls: layouts, api: API });

  // Reload so the frontend store re-reads our arrangement — otherwise the
  // Publish dialog would read stale positions from the store and overwrite
  // what we just PUT.
  await page.reload();
  // networkidle can hang up to its full timeout when something keeps the
  // network busy (multi-select param SQL options refresh, websocket pings,
  // dashboard data fetches). 5s best-effort drain — the explicit
  // #selectConnection wait below is what proves the canvas is interactive.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 15_000 });
}

// ── Filter-bar / parameter helpers ────────────────────────────────────────────

/** Open the Dashboard Filters dialog, switch to DSL mode, paste the
 *  reportParameters {...} block, save. */
export async function addFilterBarParam(
  page: Page,
  dslCode: string,
  captureBeforeDone?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnConfigureFilters').click();
  await page.locator('#btnDslToggle').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnDslToggle').click();
  const dslEditor = page.locator('#filterDslEditorContainer .cm-content');
  await dslEditor.waitFor({ state: 'visible', timeout: 5_000 });
  await dslEditor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, dslCode);
  // Optional capture point — modal is open, DSL is pasted, Done has not been
  // clicked yet. Docs/blog specs use this to screenshot the dialog with its
  // editor contents visible, so readers can see the syntax to paste.
  if (captureBeforeDone) {
    await page.waitForTimeout(300);
    await captureBeforeDone();
  }
  await page.locator('#btnDoneFilters').click();
  await page.waitForTimeout(1_500);
  await page.locator('rb-parameters').waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500);
}

// ── Per-widget configuration helpers ──────────────────────────────────────────

/** Click the most recently added widget's header to bind the right panel to it.
 *  4s settle so VisualQueryBuilder and ConfigPanel fully re-mount. */
export async function selectLastWidget(page: Page): Promise<void> {
  await page.locator('.react-grid-placeholder').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.locator('[id^="widgetHeader-"]').last().click();
  await page.waitForTimeout(4_000);
}

/** Read the most recently added widget's id suffix from the DOM. */
export async function getLastWidgetId(page: Page): Promise<string> {
  const headerId = await page.locator('[id^="widgetHeader-"]').last().getAttribute('id');
  if (!headerId) throw new Error('No widget header found in DOM');
  return headerId.replace(/^widgetHeader-/, '');
}

/** Poll until the widget body contains an rb-* visualisation component. */
export async function waitForWidgetData(
  page: Page,
  widgetId: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (true) {
    const state = await page.evaluate((id) => {
      const widget = document.getElementById(`widget-${id}`);
      if (!widget) return { phase: 'no-widget' as const };
      const errorEl = widget.querySelector('.text-destructive');
      if (errorEl) return { phase: 'error' as const, message: (errorEl.textContent || '').trim().slice(0, 300) };
      const viz = widget.querySelector(
        'rb-value, rb-trend, rb-chart, rb-tabulator, rb-pivot-table, rb-map, rb-gauge',
      );
      if (viz) return { phase: 'rendered' as const };
      if (widget.querySelector('.animate-spin')) return { phase: 'loading' as const };
      return { phase: 'unknown' as const };
    }, widgetId);
    if (state.phase === 'rendered') return;
    if (state.phase === 'error') throw new Error(`Widget ${widgetId} errored: ${(state as { message?: string }).message}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Widget ${widgetId} data never arrived after ${timeoutMs}ms`);
    await page.waitForTimeout(300);
  }
}

/** After switchToWidget('chart'), open Display tab and pick the chart subtype.
 *  Optional `captureBeforeReturn` runs after the value is set, while the panel
 *  is naturally on Display — used by docs/blog specs to capture the configured
 *  Display tab without forcing an extra tab click. */
export async function setChartType(
  page: Page,
  type: string,
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.locator(`#btnChartType-${type}`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`#btnChartType-${type}`).click();
  await page.waitForTimeout(500);
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Open Display tab, click the legend choice button (show / hide / auto), close.
 *  ChartConfig.tsx renders the buttons as `#btnChartLegend-${choice}`. */
export async function setChartLegend(
  page: Page,
  choice: 'show' | 'hide' | 'auto',
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.locator(`#btnChartLegend-${choice}`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`#btnChartLegend-${choice}`).click();
  await page.waitForTimeout(400);
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(300);
}

/** Open Display tab, fill the Chart title input, close. Persisted by
 *  ChartConfig into `options.plugins.title.text` of the chart DSL — Chart.js
 *  then renders it as the chart's centred title at the top of the canvas. */
export async function setChartTitle(
  page: Page,
  title: string,
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  const input = page.locator('#inputChartTitle');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.click();
  await input.fill(title);
  // Blur so the onChange commits. fill() already triggers React onChange via
  // synthetic input event, but a tiny settle lets the DSL writeback propagate
  // to the canvas-store before the next step's rerender races it.
  await page.waitForTimeout(300);
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(300);
}

/** Open Display tab, pick the X-axis dimension and/or Y-axis measure for a
 *  Chart widget. Drives the first X/Y axis slots (`#selectChartXAxis-0`,
 *  `#selectChartYAxis-0`) — sufficient for single-series charts (bar, line,
 *  area, donut). For multi-series, set additional slots manually.
 *
 *  The dropdown lists both Dimensions and Measures grouped under <optgroup>;
 *  `selectOption(value)` matches by `<option value="...">` which is the
 *  column name, so pass the column name directly. */
export async function setChartAxes(
  page: Page,
  opts: { x?: string; y?: string },
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  if (opts.x !== undefined) {
    // Auto-promote can pre-fill xFields[0..1] (X axis + series-split) when the
    // SQL returns >=2 dims. selectOption only overwrites slot 0, so any extra
    // slot 1 would silently linger in the persisted dslConfig. Peel slot 1 off
    // until only slot 0 remains, then set the requested value.
    for (let i = 0; i < 4; i++) {
      const extra = page.locator('#btnRemoveChartXAxis-1');
      if (!(await extra.isVisible().catch(() => false))) break;
      await extra.click();
      await page.waitForTimeout(150);
    }
    const xSel = page.locator('#selectChartXAxis-0');
    await xSel.waitFor({ state: 'visible', timeout: 10_000 });
    await xSel.selectOption(opts.x);
    await page.waitForTimeout(300);
  }
  if (opts.y !== undefined) {
    // Same hazard as X: auto-promote sets yFields to ALL measures, so if the
    // SQL returns multiple non-ID numeric columns, slot 0 gets overwritten and
    // every other slot leaks into the published chart as a duplicate dataset.
    for (let i = 0; i < 8; i++) {
      const extra = page.locator('#btnRemoveChartYAxis-1');
      if (!(await extra.isVisible().catch(() => false))) break;
      await extra.click();
      await page.waitForTimeout(150);
    }
    const ySel = page.locator('#selectChartYAxis-0');
    await ySel.waitFor({ state: 'visible', timeout: 10_000 });
    await ySel.selectOption(opts.y);
    await page.waitForTimeout(300);
  }
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Open the Chart widget's DSL editor (shared `DslCustomizer` component, ids
 *  `#btnDslToggle` + `#dslEditorContainer`), paste a Groovy `chart { ... }`
 *  DSL block, save. Mirrors the structure of `addFilterBarParam` but scoped
 *  to the right-panel chart config (no `#btnConfigureFilters` modal). */
export async function setChartDsl(page: Page, dslCode: string): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  await page.locator('#btnDslToggle').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnDslToggle').click();
  const dslEditor = page.locator('#dslEditorContainer .cm-content');
  await dslEditor.waitFor({ state: 'visible', timeout: 5_000 });
  await dslEditor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, dslCode);
  await page.waitForTimeout(500);
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Open Display tab, set the Number widget label, return to Data tab. */
export async function setNumberLabel(
  page: Page,
  label: string,
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  const input = page.locator('#inputNumberLabel');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.click();
  await input.fill(label);
  await page.waitForTimeout(500);
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Open Display tab, set the Number widget format, return to Data tab. */
export async function setNumberFormat(
  page: Page,
  format: string,
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  const select = page.locator('#selectNumberFormat');
  await select.waitFor({ state: 'visible', timeout: 10_000 });
  await select.selectOption(format);
  await page.waitForTimeout(500);
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

/** Open Display tab, configure the Gauge widget. `higherIsWorse` flips the
 *  band-color order so high values render red — for risk metrics (exposure,
 *  leverage). Storage key in widget config is `gaugeBandsReverse`. */
export async function setGaugeConfig(
  page: Page,
  opts: {
    label?: string;
    min?: number;
    max?: number;
    format?: string;
    higherIsWorse?: boolean;
    /** Three thresholds for the gauge bands (low→mid→high). Array length must
     *  be 3 — matches the fixed 3-band UI in GaugeConfig.tsx. */
    bands?: [number, number, number];
  },
  captureBeforeReturn?: () => Promise<void>,
): Promise<void> {
  await page.locator('#btnDisplayTab').click();
  if (opts.label !== undefined) {
    const input = page.locator('#inputGaugeLabel');
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await input.fill(opts.label);
    await page.waitForTimeout(300);
  }
  if (opts.min !== undefined) {
    const input = page.locator('#inputGaugeMin');
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await input.fill(String(opts.min));
    await page.waitForTimeout(300);
  }
  if (opts.max !== undefined) {
    const input = page.locator('#inputGaugeMax');
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await input.fill(String(opts.max));
    await page.waitForTimeout(300);
  }
  if (opts.format !== undefined) {
    const select = page.locator('#selectGaugeFormat');
    await select.waitFor({ state: 'visible', timeout: 10_000 });
    await select.selectOption(opts.format);
    await page.waitForTimeout(300);
  }
  if (opts.bands !== undefined) {
    for (let i = 0; i < opts.bands.length; i++) {
      const input = page.locator(`#inputGaugeBand-${i}`);
      await input.waitFor({ state: 'visible', timeout: 10_000 });
      await input.click();
      await input.fill(String(opts.bands[i]));
      await page.waitForTimeout(200);
    }
  }
  if (opts.higherIsWorse !== undefined) {
    const cb = page.locator('#cbGaugeHigherIsWorse');
    await cb.waitFor({ state: 'visible', timeout: 10_000 });
    const isChecked = await cb.isChecked();
    if (isChecked !== opts.higherIsWorse) {
      await cb.click();
      await page.waitForTimeout(200);
    }
  }
  if (captureBeforeReturn) await captureBeforeReturn();
  await page.locator('#btnDataTab').click();
  await page.waitForTimeout(500);
}

// ── Per-step layout / publish helpers ─────────────────────────────────────────

/** Apply the partial layout for all widgets-so-far (via `arrangeWidgets`),
 *  re-select the just-added widget (right panel rebinds to its config),
 *  paint a blue ring around it for the docs reader, return a `dispose()`
 *  callback that clears the ring.
 *
 *  Resilient post-reload click: waits for the header to be attached, scrolls
 *  it into view (defends against manual scrolling during the test), clicks
 *  with a 5s timeout, and falls back to `dispatchEvent('click')` if a
 *  transient overlay intercepts. The follow-up `scrollIntoView({block:'center'})`
 *  on the highlighted widget compensates for any scroll the user did while
 *  the test was running. */
export async function arrangeAndHighlight(
  page: Page,
  canvasId: string,
  layoutSlice: GridPos[],
  currentWidgetId: string,
): Promise<() => Promise<void>> {
  await arrangeWidgets(page, canvasId, layoutSlice);

  const header = page.locator(`#widgetHeader-${currentWidgetId}`);
  await header.waitFor({ state: 'attached', timeout: 30_000 });
  await header.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
  try {
    await header.click({ timeout: 5_000 });
  } catch {
    await header.dispatchEvent('click');
  }
  await page.waitForTimeout(2_000);

  await page.evaluate((id) => {
    const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
    if (!el) return;
    el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
    el.style.transition = 'none';
    el.style.boxShadow = '0 0 0 4px #2563eb, 0 0 24px rgba(37, 99, 235, 0.45)';
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, currentWidgetId);
  await page.waitForTimeout(200);

  return async () => {
    await page.evaluate((id) => {
      const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
      if (!el) return;
      el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
      delete el.dataset.docscreenPrevShadow;
    }, currentWidgetId);
  };
}

/** Click Publish Dashboard, wait for the export POST, click Close.
 *  Returns the backend-generated reportId + dashboardUrl. */
/**
 * Temporarily position `selector` as a `position: fixed` 100vw × 100vh element,
 * run `fn`, then restore the original inline styles. Use for screenshots that
 * want the widest possible rendering of a single element — Chart.js / table
 * widgets re-render at the new container size, so the captured pixels are at
 * full viewport scale instead of being squeezed by sibling panels.
 *
 * ReactGridLayout positions grid items with CSS `transform: translate(...)`. A
 * transformed ancestor creates a containing block for `position: fixed`
 * descendants — so a naive position:fixed on the widget would be anchored to
 * the grid item, not the viewport, and clip badly. We walk up the ancestor
 * chain, snapshot any non-`none` transforms, set them to 'none' so the
 * containing block is the viewport, then restore on the way out.
 *
 * Inline styles (`position`, inset, dimensions, z-index, background) on the
 * target node + any transformed ancestors are all snapshot+restored. The 800
 * ms wait gives ResizeObserver-driven re-renders (Chart.js, tabulator) time
 * to settle before the screenshot is taken.
 */
export async function withElementFullscreen(
  page: Page,
  selector: string,
  fn: () => Promise<void>,
): Promise<void> {
  const el = page.locator(selector);
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  const prev = await el.evaluate((node: HTMLElement) => {
    // Walk up the DOM and neutralise any transform that would create a
    // containing block for our position:fixed. Save originals to restore.
    const savedAncestors: Array<{ idx: number; transform: string }> = [];
    const ancestors: HTMLElement[] = [];
    let p: HTMLElement | null = node.parentElement;
    while (p && p !== document.body) {
      ancestors.push(p);
      const cs = getComputedStyle(p);
      if ((cs.transform && cs.transform !== 'none') || (cs.filter && cs.filter !== 'none') || (cs.perspective && cs.perspective !== 'none')) {
        savedAncestors.push({ idx: ancestors.length - 1, transform: p.style.transform ?? '' });
        p.style.transform = 'none';
      }
      p = p.parentElement;
    }
    // Tag the node with the ancestor list so the restore step can find them.
    const w = window as unknown as { __rbFullscreenState?: { ancestors: HTMLElement[]; savedAncestors: typeof savedAncestors } };
    w.__rbFullscreenState = { ancestors, savedAncestors };

    const saved = {
      position: node.style.position ?? '',
      top: node.style.top ?? '',
      left: node.style.left ?? '',
      right: node.style.right ?? '',
      bottom: node.style.bottom ?? '',
      width: node.style.width ?? '',
      height: node.style.height ?? '',
      zIndex: node.style.zIndex ?? '',
      background: node.style.background ?? '',
    };
    Object.assign(node.style, {
      position: 'fixed',
      top: '0', left: '0', right: '0', bottom: '0',
      width: '100vw', height: '100vh',
      zIndex: '9999',
      background: '#ffffff',
    });
    return saved;
  });
  await page.waitForTimeout(800);
  try {
    await fn();
  } finally {
    await el.evaluate(
      (node: HTMLElement, saved: Record<string, string>) => {
        Object.assign(node.style, saved);
        const w = window as unknown as { __rbFullscreenState?: { ancestors: HTMLElement[]; savedAncestors: Array<{ idx: number; transform: string }> } };
        const state = w.__rbFullscreenState;
        if (state) {
          for (const { idx, transform } of state.savedAncestors) {
            const el2 = state.ancestors[idx];
            if (el2) el2.style.transform = transform;
          }
          delete w.__rbFullscreenState;
        }
      },
      prev,
    ).catch(() => { /* element may have been re-rendered/removed — ignore */ });
  }
}

export async function publishDashboard(
  page: Page,
): Promise<{ reportId: string; dashboardUrl: string }> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.locator('#btnPublishDashboard').click();
  const confirmBtn = page.locator('#btnPublishConfirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });

  const [response] = await Promise.all([
    page.waitForResponse(
      r => /\/explorations\/[^/]+\/export$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 90_000 },
    ),
    confirmBtn.click(),
  ]);
  const body = await response.json();

  await page.locator('#publishSuccess').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#btnPublishClose').click();

  return { reportId: body.reportId, dashboardUrl: body.dashboardUrl };
}

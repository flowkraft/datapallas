// ═══════════════════════════════════════════════════════════════════════════════
// cube-stories.spec.ts
// The cube demo page, as a visitor meets it (Phase 3c, design part 8).
//
// The page is `g-cube-stories`: one card for every cube DataPallas ships, each
// card a live cube with the questions it was written to answer. It is the page
// datapallas.com frames, so this spec opens it the way that visitor does —
// through a share link, in a browser with no session at all. Everything it
// asserts is therefore also an assertion that the page works for somebody who
// was only sent a link.
//
// The link is made in `beforeAll` and taken back in `afterAll`, as
// `auth-embed-share.spec.ts` makes and revokes its own. Plain Playwright, no
// Electron and no sign-in, for the same reason that file uses it: a recipient
// has nothing but the URL, and a fixture that signed in would be testing
// something else.
//
// The steps live in `helpers/cube-stories-test-helper.ts`, because
// `cube-stories.public.ts` runs the very same steps against the very same page
// inside the iframe on datapallas.com. Nothing below states a row or a hint:
// the hints are the cubes' own `hints.json` and the rows are
// `_resources/cube-checks/*.checks.json`, the files the Java vendor loop
// checks its generated SQL against.
//
// Written and checked, never run here: the owner runs it (TODO 14 of
// 03c-phase-3c-cube-stories-docs-e2e.md).
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, type Page, type Frame } from '@playwright/test';

import { Helpers } from '../../utils/helpers';
import {
  CUBE_STORIES_CARDS,
  CUBE_STORIES_PANELS,
  CUBE_STORIES_REPORT_ID,
  answerCardParams,
  asksOf,
  cardOf,
  cardRoot,
  checksOf,
  chooseSqlVendor,
  clickShowMe,
  createCubeStoriesShareLink,
  difference,
  drawnRows,
  embedTokenOf,
  expectNoCardWarns,
  expectOnlyThisPanelIsOpen,
  expectTheWholePage,
  expectTreeShows,
  hideCode,
  inCard,
  openCode,
  openSql,
  panelOf,
  reseedCubeDemoData,
  revokeCubeStoriesShareLinks,
  shippedCubeCode,
  sqlText,
  waitForCard,
  walkEveryHint,
  type AdminFetch,
} from '../../helpers/cube-stories-test-helper';

const BASE_URL = 'http://localhost:9090';

/** The eight databases DataPallas writes cube SQL for, in the order `/meta` lists them. */
const EVERY_VENDOR = ['oracle', 'sqlserver', 'postgres', 'mysql', 'db2', 'sqlite', 'duckdb', 'clickhouse'];

/** Two texts compare the same however they are wrapped. */
const asOneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Administrator calls — seeding, the share link — carry the installation key. Everything the page
 * itself does carries nothing but what the link put in it, which is the whole point of the file.
 */
const adminFetch: AdminFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

// One page, opened once per worker: a page of live cubes is a heavy one and every test asks the same
// page different questions, in order. No test needs what an earlier one did - each starts from a
// Show Me (which replaces the selection), a walk of every hint, or a page of its own, and the helpers
// open a card's panel before they use it - so the file is not serial: a red test does not skip the
// ones after it, which run on a fresh worker that opens the page again.

test.describe('Cube Stories — the cube demo page', () => {
  let page: Page;
  let frame: Frame;
  let shareToken: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(20 * 60_000);

    // The data first: the checks are the rows of the demo data seeded for one fixed day, so the
    // page is asked to answer for that day whatever day the run happens on.
    await reseedCubeDemoData(adminFetch, BASE_URL);

    shareToken = await createCubeStoriesShareLink(adminFetch, BASE_URL);

    page = await browser.newPage();
    await page.goto(
      `${BASE_URL}/dashboard/${CUBE_STORIES_REPORT_ID}?token=${encodeURIComponent(shareToken)}`,
    );
    frame = page.mainFrame();
    await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
  });

  test.afterAll(async () => {
    try {
      if (page) await page.close();
    } finally {
      await revokeCubeStoriesShareLinks(adminFetch, BASE_URL);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. The page itself: the cards, what a card opens up, and the SQL panel.
  //
  // Positive half, the whole chain: a visitor with nothing but a link gets
  // one card per cube, each drawing its own rows from its own live cube, with the
  // cube's own definition behind Show Config and its SQL — for any of eight
  // databases — behind Show SQL.
  //
  // Negative half: Show Me REPLACES the selection rather than adding to it; a
  // selection naming a field the cube has not got changes nothing and says so;
  // an untouched card says what to do instead of showing an empty table; and
  // the page's own credential opens this page's components and nothing else.
  //
  // Made to go red: `expect(sqlOnOracle).not.toBe(sqlOnDuckDb)` — a generator
  // that ignored the chosen vendor, or a panel that never re-asked, would write
  // the same statement for both and the vendor picker would be a decoration.
  // ────────────────────────────────────────────────────────────────────────────
  test('(cube-stories) the page, the hints, the SQL vendor and live SQL', async () => {
    test.setTimeout(15 * 60_000);

    await expectTheWholePage(frame);

    // ── What a card opens up: the cube's own file, not a description of it ──
    const sales = cardOf('northwind-sales');
    await waitForCard(frame, sales.id);
    expect(asOneLine(await openCode(frame, sales.id)))
      .toBe(asOneLine(shippedCubeCode(sales)));
    await hideCode(frame, sales.id);

    // ── Show Me replaces, it does not add ───────────────────────────────────
    const deals = cardOf('sales-pipeline');
    await waitForCard(frame, deals.id);
    const dealsAsk = { id: 'deals-by-stage', query: { dimensions: ['Stage'], measures: ['Deals', 'DealValue'] } };

    // A tick asks its question a moment later (the card waits to see if more boxes follow), so the
    // tick's own answer is waited for and drawn before Show Me is clicked: that is the visitor's
    // screen the click replaces, and the one question Show Me asks is then the only one counted.
    const tickAnswered = page.waitForResponse(
      (r) => r.url().includes(`/cube/${deals.id}/query`) && r.request().method() === 'POST',
      { timeout: 60_000 });
    await inCard(frame, deals.id, '#chk-dim-LeadSource').check();
    await expect(inCard(frame, deals.id, '#chk-dim-LeadSource')).toBeChecked();
    const tickRows = ((await (await tickAnswered).json()).rows ?? []).length;
    await expect
      .poll(async () => (await drawnRows(frame, deals.id)).length, { timeout: 60_000 })
      .toBe(tickRows);

    let queriesAsked = 0;
    const countQueries = (request: { url(): string; method(): string }) => {
      if (request.method() === 'POST' && request.url().includes(`/cube/${deals.id}/query`)) queriesAsked++;
    };
    page.on('request', countQueries);
    try {
      await clickShowMe(frame, deals.id, dealsAsk.id);
    } finally {
      page.off('request', countQueries);
    }
    // The field ticked by hand is gone, the hint's fields are there, and the card asked its
    // question once: a Show Me that applied the fields one at a time would ask several times.
    await expect(inCard(frame, deals.id, '#chk-dim-LeadSource')).not.toBeChecked();
    await expectTreeShows(frame, deals.id, dealsAsk.query);
    expect(queriesAsked, 'Show Me is one question, not one per field').toBe(1);

    const afterShowMe = await drawnRows(frame, deals.id);
    const stages = checksOf(deals.id).get('deals-by-stage');
    expect(difference(stages!.rows, afterShowMe, false)).toBeNull();

    // The visitor carries on from there: a field ticked after Show Me is a new question, which is
    // what makes Show Me a starting point rather than a slideshow.
    await inCard(frame, deals.id, '#chk-dim-LeadSource').check();
    await expect
      .poll(async () => (await drawnRows(frame, deals.id)).length, { timeout: 60_000 })
      .toBeGreaterThan(afterShowMe.length);
    await inCard(frame, deals.id, '#chk-dim-LeadSource').uncheck();
    await expect
      .poll(async () => (await drawnRows(frame, deals.id)).length, { timeout: 60_000 })
      .toBe(afterShowMe.length);

    // ── A selection naming a field this cube has not got ────────────────────
    // No shipped hint can do this — Phase 1b's check test refuses a hints file that names an
    // unknown field — so it is asked of the component directly, the way a hint asks it.
    const refused = await inCard(frame, deals.id, 'rb-cube-renderer').evaluate((el) =>
      (el as unknown as { applySelection(query: unknown): boolean })
        .applySelection({ dimensions: ['NoSuchField'], measures: ['Deals'] }));
    expect(refused, 'a selection naming a field the cube has not got is refused').toBe(false);
    await expect(inCard(frame, deals.id, '#cubeRuntimeError')).toContainText('NoSuchField');
    // And nothing moved: a refusal is not half a selection.
    await expectTreeShows(frame, deals.id, dealsAsk.query);
    expect(difference(stages!.rows, await drawnRows(frame, deals.id), false)).toBeNull();

    // ── The answer as a table: the cube's titles, and money written as money ─
    const freight = checksOf(sales.id).get('freight-by-country')!;
    const germany = freight.rows.find((row) => String(row[0]) === 'Germany');
    expect(germany, 'the Northwind freight check has a row for Germany').toBeTruthy();

    await clickShowMe(frame, sales.id, 'freight-by-country');
    // The columns are headed by what the cube calls those fields, not by the column names of the
    // database underneath.
    await expect(inCard(frame, sales.id, '#cubeRuntimeResult .tabulator-col-title').first())
      .toHaveText('Ship Country');
    await expect(inCard(frame, sales.id, '#cubeRuntimeResult')).toContainText('Total Freight');

    const germanyRow = inCard(frame, sales.id, '#cubeRuntimeResult .tabulator-row')
      .filter({ hasText: 'Germany' });
    const germanyText = ((await germanyRow.locator('.tabulator-cell').last().textContent()) ?? '').trim();
    // Written in the cube's currency, wherever the run happens: the symbol and the number, not one
    // hard-coded spelling of them.
    expect(germanyText, 'a currency measure is drawn as money').toContain('$');
    expect(Math.abs(Number(germanyText.replace(/[^0-9.]/g, '')) - Number(germany![1])))
      .toBeLessThanOrEqual(0.01);

    // Sorting a column is the table's own doing: the rows are re-ordered in the browser, and the
    // cube is not asked anything again.
    const countries = freight.rows.map((row) => String(row[0])).sort();
    const firstCountry = async () =>
      ((await inCard(frame, sales.id, '#cubeRuntimeResult .tabulator-row').first()
        .locator('.tabulator-cell').first().textContent()) ?? '').trim();
    const header = inCard(frame, sales.id, '#cubeRuntimeResult .tabulator-col-title').first();

    let askedWhileSorting = 0;
    const countSortQueries = (request: { url(): string; method(): string }) => {
      if (request.method() === 'POST' && request.url().includes(`/cube/${sales.id}/`)) askedWhileSorting++;
    };
    page.on('request', countSortQueries);
    try {
      await header.click();
      await expect.poll(firstCountry, { timeout: 20_000 }).toBe(countries[0]);
      await header.click();
      await expect.poll(firstCountry, { timeout: 20_000 }).toBe(countries[countries.length - 1]);
    } finally {
      page.off('request', countSortQueries);
    }
    expect(askedWhileSorting, 'sorting a column asks the server nothing').toBe(0);

    // ── The SQL panel: eight databases, and one picker for the whole page ────────
    await openSql(frame, deals.id);
    // D11: the choice is made once, in the page header, and nowhere inside a card.
    await expect(frame.locator('#cubeSqlVendor'), 'one database picker for the page')
      .toHaveCount(1);
    await expect(frame.locator('.dash-header #cubeSqlVendor'),
      'and it is in the page header, with the title').toHaveCount(1);
    await expect(frame.locator('#cubeRuntimeSqlVendor'),
      'no select inside any cube').toHaveCount(0);
    await expect(frame.locator('#cubeSqlVendor option')).toHaveCount(EVERY_VENDOR.length);
    expect(await frame.locator('#cubeSqlVendor option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
      .toEqual(EVERY_VENDOR);
    await expect(frame.locator('#cubeSqlVendor'),
      'the page starts on the database the rows really come from').toHaveValue('duckdb');
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql')).toContainText('DuckDB');
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql'),
      'and the box says where the rows come from, by name').toContainText('the rows come from DuckDB');

    const sqlOnDuckDb = await sqlText(frame, deals.id);
    const rowsBefore = await drawnRows(frame, deals.id);

    await chooseSqlVendor(frame, deals.id, 'oracle');
    const sqlOnOracle = await sqlText(frame, deals.id);
    expect(sqlOnOracle, 'another database is another statement').not.toBe(sqlOnDuckDb);
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql')).toContainText('Oracle');
    // ── The chrome of the tile: where the detail toggle sits, and the two boxes ──
    // The industries are one accordion: opening the Deals card above closed this card's panel.
    await waitForCard(frame, sales.id);
    // Both boxes are closed again here, so the buttons read what a reader first sees.
    const chrome = await inCard(frame, sales.id, 'rb-cube-renderer').evaluate((host: Element) => {
      const root: ParentNode = (host as HTMLElement).shadowRoot ?? host;
      const toggle = root.querySelector('#chk-show-everything');
      const fields = Array.from(root.querySelectorAll('.rb-tree-field'));
      const lastField = fields.length > 0 ? fields[fields.length - 1] : null;
      const result = root.querySelector('#cubeRuntimeResult');
      const follows = (first: Element | null, second: Element | null) =>
        !!first && !!second
        && !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        fields: fields.length,
        toggleAfterTheTree: follows(lastField, toggle),
        toggleBeforeTheAnswer: follows(toggle, result),
        buttons: Array.from(root.querySelectorAll('.rb-opened-buttons button'))
          .map((button) => (button.textContent ?? '').trim()),
      };
    });
    expect(chrome.fields, 'the tree has fields to be detailed').toBeGreaterThan(0);
    expect(chrome.toggleAfterTheTree, 'the detail toggle is under the last field of the tree')
      .toBe(true);
    expect(chrome.toggleBeforeTheAnswer,
      'and above the answer, not under it and under the SQL box (D12)').toBe(true);
    expect(chrome.buttons,
      "the cube's own definition first, then the statement (D13)")
      .toEqual(['Show Config', 'Show SQL']);

    // Ticking it adds the second level of detail the toggle is for - a line of type and settings
    // under each field - and nothing else moves. The cube's own facts (its table or SQL) are no
    // part of a live tile at any time: a viewer is told what the cube offers, never how it reads.
    await expect(inCard(frame, sales.id, '.rb-detail'),
      'the tile opens without the detail lines').toHaveCount(0);
    await inCard(frame, sales.id, '#chk-show-everything').check();
    await expect(inCard(frame, sales.id, '#chk-show-everything')).toBeChecked({ timeout: 15_000 });
    await expect(inCard(frame, sales.id, '.rb-detail').first(),
      'and ticking it shows the line under the fields').toBeVisible({ timeout: 15_000 });
    await expect(inCard(frame, sales.id, '.rb-facts'),
      'but never how the cube reads its data').toHaveCount(0);
    await inCard(frame, sales.id, '#chk-show-everything').uncheck();
    await expect(inCard(frame, sales.id, '.rb-detail')).toHaveCount(0);

    // The words the owner read as an author's, not a reader's, are on no tile of the page (D13).
    await expect(frame.locator('.rb-cube-stories-root').locator('text=View SQL'),
      'no tile says View SQL any more').toHaveCount(0);
    await expect(frame.locator('.rb-cube-stories-root').locator('text=View Code'),
      'and none says View Code').toHaveCount(0);

    // Show SQL writes a statement; it does not run one. The rows on the screen are still the ones
    // the widget's own connection answered.
    expect(difference(rowsBefore, await drawnRows(frame, deals.id), false)).toBeNull();

    // The choice belongs to the page, not to one card: every other card follows it.
    const tickets = cardOf('support-desk');
    await waitForCard(frame, tickets.id);
    await openSql(frame, tickets.id);
    await expect(frame.locator('#cubeSqlVendor')).toHaveValue('oracle');
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSql')).toContainText('Oracle');
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSql'),
      'a card written for Oracle still says where its rows come from')
      .toContainText('the rows come from DuckDB');

    await chooseSqlVendor(frame, deals.id, 'duckdb');
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSql')).toContainText('DuckDB');

    // ── A card with nothing ticked says what to do ──────────────────────────
    // Support Desk's panel is the open one now (the industries are one accordion): back to Deals.
    await waitForCard(frame, deals.id);
    for (const measure of ['Deals', 'DealValue']) {
      await inCard(frame, deals.id, `#chk-meas-${measure}`).uncheck();
    }
    await inCard(frame, deals.id, '#chk-dim-Stage').uncheck();
    await expect(inCard(frame, deals.id, '#cubeRuntimeResult')).toContainText('Tick a measure or a dimension');
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql')).toContainText('Tick a field to see its SQL');

    // ── What the page's own credential opens, and what it does not ──────────
    const embedToken = await embedTokenOf(frame, deals.id);
    const carrying = { 'X-Embed-Token': embedToken, 'Content-Type': 'application/json' };

    const notOnThisPage = await page.request.get(
      `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/no-such-component/meta`,
      { headers: carrying, failOnStatusCode: false });
    expect(notOnThisPage.status(), 'a component this page does not declare is not a component').toBe(404);

    const anotherReport = await page.request.get(
      `${BASE_URL}/api/reports/g-pivottable/cube/sales-pipeline/meta`,
      { headers: carrying, failOnStatusCode: false });
    expect([401, 403, 404], 'the page credential opens this page and no other').toContain(anotherReport.status());

    const noSuchMember = await page.request.post(
      `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/${deals.id}/query`,
      { headers: carrying, data: { dimensions: ['NoSuchField'], measures: ['Deals'] }, failOnStatusCode: false });
    expect(noSuchMember.status()).toBe(400);
    expect(await noSuchMember.text()).toContain('NoSuchField');

    // A request that tries to bring its own SQL, its own database or its own cube is refused, by
    // name, and never answered from what it brought: silently dropping the key would let the
    // caller believe the rows were the ones they asked for. The same selection without it is
    // answered from the widget's entry alone.
    const plain = await page.request.post(
      `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/${deals.id}/query`,
      { headers: carrying, data: { dimensions: ['Stage'], measures: ['Deals', 'DealValue'] } });
    expect(plain.status()).toBe(200);
    for (const [key, value] of [['sql', 'SELECT 1'], ['connectionId', 'rbt-sample-northwind-sqlite-4f2'],
                                ['cubeName', 'another-cube']]) {
      const smuggled = await page.request.post(
        `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/${deals.id}/query`,
        { headers: carrying, failOnStatusCode: false,
          data: { dimensions: ['Stage'], measures: ['Deals', 'DealValue'], [key]: value } });
      expect(smuggled.status(), `'${key}' in a viewer's request is refused`).toBe(400);
      expect(await smuggled.text(), 'and the refusal names it').toContain(`'${key}'`);
    }

    // D11: a choice lives in the page and is gone with it. Oracle is picked here, and the page
    // that comes back is on DuckDB - where the rows really come from - and not on what somebody
    // picked once.
    await chooseSqlVendor(frame, deals.id, 'oracle');
    await expect(frame.locator('#cubeSqlVendor')).toHaveValue('oracle');

    // Put the page back the way it opens, for the walks that follow.
    await page.reload();
    frame = page.mainFrame();
    await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
    await waitForCard(frame, deals.id);
    await expect(frame.locator('#cubeSqlVendor'),
      "a fresh page is on the rows' own database, whatever was picked before the reload")
      .toHaveValue('duckdb');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2–6. Every hint of every card, clicked and checked.
  //
  // The walk is data-driven: each test names cards, never hints. For each card
  // the helper reads that cube's `hints.json`, asserts that the card offers
  // exactly those questions and that every one of them has a check (and every
  // check a question), then clicks each Show Me, checks that the tree now shows
  // the hint's own fields and buckets, and compares the drawn rows with the
  // check. So a hint added to one of these cubes later is walked the day it is
  // added, with no new e2e (Phase 4).
  //
  // Made to go red, in all five: the row comparison. A cube whose SQL started
  // double-counting a joined row, a Show Me that filled the tree with the wrong
  // fields, or demo data seeded for the wrong day would each change the rows a
  // card draws, and `difference` names the first row that does not answer.
  // ────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // D14: a link into a closed industry.
  //
  // The page lists 16 cards behind seven bars, so a link to one card - from the
  // samples list, from a shared URL, from the page's own address bar - is a link
  // into a panel that is closed. What the visitor asked for is the card, so the
  // panel opens and the card is where they can see it, both when the page loads
  // on that address and when the hash changes under an open page.
  //
  // Made to go red: nothing opening the panel at all (the browser will not
  // scroll to a card inside a closed `<details>`, so the visitor lands at the
  // top of the page), or a page that opened it on load only and left a later
  // link doing nothing.
  // ─────────────────────────────────────────────────────────────────────────────
  test('(cube-stories) a #cube link opens that cube\'s industry', async () => {
    test.setTimeout(10 * 60_000);
    const shared = `${BASE_URL}/dashboard/${CUBE_STORIES_REPORT_ID}?token=${encodeURIComponent(shareToken)}`;

    // Loading on the address: Retail & E-commerce, the third bar, open at Online Sales.
    await page.goto(`${shared}#cube-online-sales`);
    frame = page.mainFrame();
    await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
    await expectOnlyThisPanelIsOpen(frame, panelOf('online-sales'));
    await expect(cardRoot(frame, 'online-sales'), 'the card the link named is on the screen')
      .toBeInViewport({ timeout: 30_000 });

    // The same link followed on the open page: a hash change, not a load, and Education opens
    // while Retail & E-commerce closes - one panel at a time, whichever way it was opened.
    await page.evaluate(() => { window.location.hash = '#cube-student-progress'; });
    await expectOnlyThisPanelIsOpen(frame, panelOf('student-progress'));
    await expect(cardRoot(frame, 'student-progress')).toBeInViewport({ timeout: 30_000 });

    // And back to the page a visitor lands on, for whatever runs after this.
    await page.goto(shared);
    frame = page.mainFrame();
    await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
    await expectOnlyThisPanelIsOpen(frame, CUBE_STORIES_PANELS[0]);
  });

  test('(cube-stories) Show Me on Deals, Tickets, Shipments and Depots', async () => {
    test.setTimeout(30 * 60_000);
    for (const id of ['sales-pipeline', 'support-desk', 'freight-shipments', 'depot-network']) {
      await walkEveryHint(frame, cardOf(id));
    }
  });

  test('(cube-stories) Show Me on the Shop, the School and Invoices & Payments', async () => {
    test.setTimeout(30 * 60_000);
    // Invoices and Payments are two cubes of one file and two cards here, and each offers only its
    // own questions — the helper asserts that, because a card showing the other cube's hints would
    // be asking about fields it has not got. Sales for a Period is the second cube of the Shop's
    // own file, and the same rule holds for it.
    for (const id of ['online-sales', 'shop-for-a-period', 'student-enrollments',
                      'customer-invoices', 'customer-payments']) {
      await walkEveryHint(frame, cardOf(id));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Story 21: the period is the question.
  //
  // The hint presets the filter rather than the cube declaring a parameter
  // (R1, the owner's decision of 2026-09-28): what a hint carries is a filter
  // like any other, so the viewer can see it as a chip, move it, and take it
  // off. The two days it presets are written as R7 tokens and resolved by the
  // server against the data's own today, which is why the quarter it opens on
  // is the quarter the demo data is in.
  //
  // Made to go red: the row comparisons. A preset the page dropped, a chip that
  // was drawn but filtered nothing, or dates sent as the raw `{dataToday: …}`
  // text would each leave the card drawing another period's rows — and the
  // last step would draw a quarter where it must draw every date the cube has.
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Sales for a Period: the chip the hint leaves, moved and taken off', async () => {
    test.setTimeout(30 * 60_000);
    const period = cardOf('shop-for-a-period');
    const checks = checksOf(period.id);

    // Q3 2026, by category: the quarter the data is in, which the hint asks for in tokens.
    const quarter = checks.get('sales-for-a-period')!;
    await clickShowMe(frame, period.id, 'sales-for-a-period');
    await expect(inCard(frame, period.id, '#chipFilter-OrderDate'),
      'the period the hint preset is a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    expect(difference(quarter.rows, await drawnRows(frame, period.id), false),
      'the rows are the quarter\'s').toBeNull();

    // The quarter before, typed into the chip's own filter rather than clicked on another hint:
    // the same question, and the rows the previous-quarter hint answers.
    const before = checks.get('sales-for-a-period/previous-quarter')!;
    await inCard(frame, period.id, '#btnFilter-OrderDate').click();
    await inCard(frame, period.id, '#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
    await inCard(frame, period.id, '#OrderDate__from').fill('2026-04-01');
    await inCard(frame, period.id, '#OrderDate__to').fill('2026-06-30');
    await inCard(frame, period.id, '#btnFilterApply').click();
    await expect
      .poll(async () => difference(before.rows, await drawnRows(frame, period.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // And off with it: no period at all is every order line the cube can see. Still the eight
    // categories, and not one of them the number the quarter answered.
    await inCard(frame, period.id, '#btnChipRemove-OrderDate').click();
    await expect(inCard(frame, period.id, '#chipFilter-OrderDate'),
      'the filter is gone, not merely emptied').toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => {
        const rows = await drawnRows(frame, period.id);
        return rows.length === quarter.rows.length
          && difference(before.rows, rows, false) !== null
          && difference(quarter.rows, rows, false) !== null;
      }, { timeout: 60_000 })
      .toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Story 22: the lanes are the viewer's to pick.
  //
  // A logistics manager looks after some destination countries, not all of
  // them. The hint presets the Country filter with two of them (owner,
  // 2026-09-28: hint-preset filters, no parameters), and that preset is a
  // filter like any other: a chip the viewer can see, open, add a country to,
  // and take off. The countries are bound one value per country and asked as
  // an IN — `CubeSampleSqlExecutesTest` proves what the other shape would do:
  // "Spain,Portugal" as ONE value runs, and answers no row at all.
  //
  // Made to go red: the row comparisons. A preset the page dropped, a chip
  // drawn over a filter that filtered nothing, or a list flattened into one
  // value would each leave the card drawing another set of lanes — and the
  // last step would draw two countries where it must draw every lane.
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Freight Cost vs Speed: the countries the hint preset, and one more', async () => {
    test.setTimeout(30 * 60_000);
    const lanes  = cardOf('freight-shipments');
    const checks = checksOf(lanes.id);

    // Spain and Portugal: the manager's own lanes, by transport mode. Road costs about twice
    // what sea costs per shipment and arrives about four times faster — that is the story.
    const iberia = checks.get('freight-cost-vs-speed/spain-and-portugal')!;
    await clickShowMe(frame, lanes.id, 'freight-cost-vs-speed--spain-and-portugal');
    await expect(inCard(frame, lanes.id, '#chipFilter-DestCountry'),
      'the countries the hint preset are a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    expect(difference(iberia.rows, await drawnRows(frame, lanes.id), false),
      'the rows are those two countries\' lanes').toBeNull();

    // France as well, ticked in the chip's own list: the same question, three countries wide.
    // (The frozen demo data: 959 shipments, 515 of them by road at 86.61 each in 4.88 days.)
    const withFrance: unknown[][] = [
      ['Air', 6, 2399.73, 399.95, 1.83],
      ['Rail', 299, 18713.34, 62.59, 6.38],
      ['Road', 515, 44602.65, 86.61, 4.88],
      ['Sea', 126, 5439.45, 43.17, 18.77],
      [null, 13, 1442.37, 110.95, null],
    ];
    await inCard(frame, lanes.id, '#btnFilter-DestCountry').click();
    await inCard(frame, lanes.id, '#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
    await inCard(frame, lanes.id, '#DestCountry').click();
    await inCard(frame, lanes.id, '#DestCountry_cb_France').click();
    await inCard(frame, lanes.id, '#DestCountry_btnOk').click();
    await inCard(frame, lanes.id, '#btnFilterApply').click();
    await expect
      .poll(async () => difference(withFrance, await drawnRows(frame, lanes.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // And off with it: no country filter at all is every lane the cube can see, which is the
    // hint's own first answer — the same five modes, and not one of them the number Iberia gave.
    const everyLane = checks.get('freight-cost-vs-speed')!;
    await inCard(frame, lanes.id, '#btnChipRemove-DestCountry').click();
    await expect(inCard(frame, lanes.id, '#chipFilter-DestCountry'),
      'the filter is gone, not merely emptied').toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => difference(everyLane.rows, await drawnRows(frame, lanes.id), false),
        { timeout: 60_000 })
      .toBeNull();
    expect(difference(iberia.rows, await drawnRows(frame, lanes.id), false),
      'every lane is not the two countries the hint preset').not.toBeNull();
  });

  test('(cube-stories) Revenue Mix: the share is of what the answer holds', async () => {
    test.setTimeout(30 * 60_000);
    const shop   = cardOf('online-sales');
    const checks = checksOf(shop.id);

    // The whole shop, by category. Displays and Video together carry more than half of it,
    // and Cables & Power almost none — which is the question a category manager asks.
    const wholeShop = checks.get('revenue-mix')!;
    await clickShowMe(frame, shop.id, 'revenue-mix');
    expect(difference(wholeShop.rows, await drawnRows(frame, shop.id), false),
      'the shop, category by category, with each share of the shop').toBeNull();

    const shareOf = (rows: unknown[][], category: string): number =>
      Number(rows.find((row) => row[0] === category)![2]);
    const drawnShop = await drawnRows(frame, shop.id);
    const shopShares = drawnShop.reduce((sum, row) => sum + Number(row[2]), 0);
    expect(shopShares, 'the shares of the whole shop are a whole').toBeCloseTo(1, 3);
    expect(shareOf(drawnShop, 'Displays'), 'Displays carry about a third').toBeCloseTo(0.3058, 4);

    // The same two measures with one filter more: every share is now of Germany's own total.
    // A share taken over the unfiltered shop would put Displays at 0.0733 here.
    const germany = checks.get('revenue-mix/germany')!;
    await clickShowMe(frame, shop.id, 'revenue-mix--germany');
    await expect(inCard(frame, shop.id, '#chipFilter-Country'),
      'the country the hint preset is a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => difference(germany.rows, await drawnRows(frame, shop.id), false),
        { timeout: 60_000 })
      .toBeNull();

    const drawnGermany = await drawnRows(frame, shop.id);
    expect(drawnGermany.reduce((sum, row) => sum + Number(row[2]), 0),
      "Germany's shares are a whole of Germany").toBeCloseTo(1, 3);
    expect(shareOf(drawnGermany, 'Displays'),
      "Germany's Displays, as a share of Germany").toBeCloseTo(0.3047, 4);
    expect(Math.abs(shareOf(drawnGermany, 'Displays') - 0.0733),
      'and not as a share of the whole shop, which would be 0.0733').toBeGreaterThan(0.2);
    expect(difference(wholeShop.rows, drawnGermany, false),
      'Germany is not the shop in miniature').not.toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Story 26: the viewer explores the cube themselves.
  //
  // The head of support is in the published dashboard, not in the authoring
  // tool, and the questions they have — where do we miss SLA, by team, by
  // category? is anyone not picking tickets up? — are not the ones the card was
  // published showing. So they tick, and the server answers from the published
  // cube file (R3, W2's /query).
  //
  // The hint "Tier 2 only" presets the Team filter, and a preset is a filter
  // like any other: a chip the viewer can open, change and take off.
  //
  // Made to go red: the row comparisons. A preset that reached the page but not
  // /query would answer all five teams where the check holds one; a Breach Rate
  // left on the old 100-scale would draw 41.7 where the check holds 0.417; and
  // a card that went back to what it was published showing when its own
  // question was answered again would lose the viewer's ticks (R3).
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Support Explorer: the teams, the one the hint preset, and the ticks that stay', async () => {
    test.setTimeout(30 * 60_000);
    const desk   = cardOf('support-desk');
    const checks = checksOf(desk.id);

    // Where the SLA is missed, team by team. The row with no team at all is the finding: 41
    // tickets nobody has picked up, and 40 of them already past their SLA.
    const byTeam = checks.get('breach-by-team')!;
    await clickShowMe(frame, desk.id, 'breach-by-team');
    expect(difference(byTeam.rows, await drawnRows(frame, desk.id), false),
      'the four teams and the tickets nobody picked up').toBeNull();

    // "Tier 2 only": the hint presets the cube's own Team filter, and the answer is one row.
    const tierTwo = checks.get('breach-by-team/team')!;
    await clickShowMe(frame, desk.id, 'breach-by-team--team');
    await expect(inCard(frame, desk.id, '#chipFilter-Team'),
      'the team the hint preset is a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => difference(tierTwo.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // The viewer adds their own team to the chip's list: the same question, two teams wide, and
    // Tier 1's rate is nothing like Tier 2's — which is the whole point of asking by team.
    const withTierOne: unknown[][] = [
      ['Tier 1', 670, 168, 0.2507],
      ['Tier 2', 1199, 500, 0.417],
    ];
    await inCard(frame, desk.id, '#btnFilter-Team').click();
    await inCard(frame, desk.id, '#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
    await inCard(frame, desk.id, '#Team').click();
    await inCard(frame, desk.id, '#Team_cb_Tier_1').click();
    await inCard(frame, desk.id, '#Team_btnOk').click();
    await inCard(frame, desk.id, '#btnFilterApply').click();
    await expect
      .poll(async () => difference(withTierOne, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // And off with it: the whole desk again, the hint's own first answer.
    await inCard(frame, desk.id, '#btnChipRemove-Team').click();
    await expect(inCard(frame, desk.id, '#chipFilter-Team'),
      'the filter is gone, not merely emptied').toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => difference(byTeam.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();
    expect(difference(tierTwo.rows, await drawnRows(frame, desk.id), false),
      'the whole desk is not the one team the hint preset').not.toBeNull();

    // The other half of the question: how long tickets take, and how long their first answer
    // takes. Urgent tickets are resolved fastest and wait longest to be answered at all.
    const byPriority = checks.get('time-by-priority')!;
    await clickShowMe(frame, desk.id, 'time-by-priority');
    await expect
      .poll(async () => difference(byPriority.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // R3, the ticks are the viewer's and survive the card asking its question again. This page
    // has no Reload button of its own — the card's parameter bar is what re-asks here — so the
    // statement card is where it can be seen: Show Me, one more dimension ticked by hand, then
    // another customer chosen. What comes back is that customer's rows on the view the viewer
    // built, and not the view the card was published showing (Status alone).
    const statement = cardOf('customer-statement');
    await clickShowMe(frame, statement.id, 'customer-statement--all-customers');
    await inCard(frame, statement.id, '#chk-dim-Customer').click();
    await expectTreeShows(frame, statement.id, {
      dimensions: ['Status', 'Customer'],
      measures: ['Invoices', 'Invoiced', 'Paid', 'BalanceDue'],
    });

    await answerCardParams(frame, statement.id, { customerId: '26' });
    await expect
      .poll(async () => {
        const rows = await drawnRows(frame, statement.id);
        return rows.length > 0 && rows.every((row) => String(row[1]) === 'Southridge Video SpA');
      }, { timeout: 60_000 })
      .toBe(true);
    await expectTreeShows(frame, statement.id, {
      dimensions: ['Status', 'Customer'],
      measures: ['Invoices', 'Invoiced', 'Paid', 'BalanceDue'],
    });

    // Put the card back the way the next test needs it, and nothing anywhere warned.
    await answerCardParams(frame, statement.id, { customerId: '' });
    await expectNoCardWarns(frame);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Story 27: last year is the same days one year back, and it moves with the
  // filter.
  //
  // The COO asks whether the desk is keeping up. The hint opens the year so
  // far with Tickets and Tickets Last Year side by side; the pair is one
  // question asked of two periods, so when the viewer moves the Opened chip
  // both columns move with it.
  //
  // Made to go red: a "last year" that was never shifted would repeat this
  // year's own column, and every row comparison here would fail; a pair that
  // did not follow the chip would keep the year-so-far numbers when the chip
  // is moved back, which the last step forbids by name.
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Support Load vs Last Year: two periods, one question, one chip', async () => {
    test.setTimeout(30 * 60_000);
    const desk   = cardOf('support-desk');
    const checks = checksOf(desk.id);

    // The year so far, by priority: this year, last year, and the breaches of each.
    const byPriority = checks.get('support-vs-last-year')!;
    await clickShowMe(frame, desk.id, 'support-vs-last-year');
    await expect(inCard(frame, desk.id, '#chipFilter-OpenedDate'),
      'the period the hint preset is a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => difference(byPriority.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // The breaches grow faster than the volume — the finding the story is told for.
    const drawn = await drawnRows(frame, desk.id);
    const summed = (column: number): number =>
      drawn.reduce((total, row) => total + Number(row[column]), 0);
    expect(summed(1) / summed(2), 'the tickets, this year over last').toBeCloseTo(1.241, 2);
    expect(summed(3) / summed(4), 'the breaches, this year over last').toBeCloseTo(1.518, 2);
    expect(summed(3) / summed(4), 'and they grow faster than the tickets do')
      .toBeGreaterThan(summed(1) / summed(2));

    // The same pair read by month: each month beside the same month one year back.
    const byMonth = checks.get('support-vs-last-year/by-month')!;
    await clickShowMe(frame, desk.id, 'support-vs-last-year--by-month');
    await expect
      .poll(async () => difference(byMonth.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // And the pair follows the chip. Moved one year back, the "this year" column reads what
    // the "last year" column read a moment ago, and there is nothing at all before the data
    // starts for the column beside it.
    await clickShowMe(frame, desk.id, 'support-vs-last-year');
    await expect
      .poll(async () => difference(byPriority.rows, await drawnRows(frame, desk.id), false),
        { timeout: 60_000 })
      .toBeNull();
    await inCard(frame, desk.id, '#btnFilter-OpenedDate').click();
    await inCard(frame, desk.id, '#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
    await inCard(frame, desk.id, '#OpenedDate__from').fill('2025-01-01');
    await inCard(frame, desk.id, '#OpenedDate__to').fill('2025-09-30');
    await inCard(frame, desk.id, '#btnFilterApply').click();
    await expect
      .poll(async () => {
        const moved = await drawnRows(frame, desk.id);
        if (moved.length !== byPriority.rows.length) return false;
        return moved.every((row) => {
          const wasLastYear = byPriority.rows.find((was) => was[0] === row[0]);
          return wasLastYear !== undefined
            && Number(row[1]) === Number(wasLastYear[2])
            && Number(row[3]) === Number(wasLastYear[4])
            && Number(row[2] ?? 0) === 0
            && Number(row[4] ?? 0) === 0;
        });
      }, { timeout: 60_000 })
      .toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Story 28: a number that can be opened.
  //
  // The operations manager reads "15 Delayed" at the morning status review and
  // needs the fifteen: the tracking numbers, the carriers and the cities, to
  // ring the carriers and warn the customers. Clicking the Shipments cell of
  // the Delayed row opens them, and what opens is exactly what was counted -
  // the month the card is filtered to, and the status of the row that was
  // clicked, never the whole month.
  //
  // Made to go red: the count of the rows in the modal (15, not the month's
  // 188), the tracking numbers in them, and the nine fields a caller needs.
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Delayed Shipments: the number opens into the fifteen behind it', async () => {
    test.setTimeout(30 * 60_000);
    const freight = cardOf('freight-shipments');
    const checks  = checksOf(freight.id);

    // This month by status, with the Booked filter the hint preset.
    const month = checks.get('delayed-shipments')!;
    await clickShowMe(frame, freight.id, 'delayed-shipments');
    await expect(inCard(frame, freight.id, '#chipFilter-BookedDate'),
      'the month the hint preset is a filter the viewer can see').toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => difference(month.rows, await drawnRows(frame, freight.id), false),
        { timeout: 60_000 })
      .toBeNull();

    const delayed = month.rows.find((row) => row[1] === 'Delayed')!;
    expect(Number(delayed[2]), 'fifteen shipments are delayed this month').toBe(15);

    // The click: the Shipments number on the Delayed row.
    const delayedRow = inCard(frame, freight.id, '#cubeRuntimeResult .tabulator-row')
      .filter({ hasText: 'Delayed' }).first();
    await expect(delayedRow, 'the Delayed row is drawn').toBeVisible({ timeout: 15_000 });
    await delayedRow.locator('.tabulator-cell').last().click();

    await expect(inCard(frame, freight.id, '#cubeDrillModal'),
      'the rows behind the number open').toBeVisible({ timeout: 30_000 });
    await expect(inCard(frame, freight.id, '#cubeDrillTitle'),
      'and the modal says which number it opened').toContainText('Delayed', { timeout: 15_000 });

    const behind = async (): Promise<unknown[][]> =>
      await inCard(frame, freight.id, '#cubeDrillModal rb-tabulator').first()
        .evaluate((el) => ((el as unknown as { data: Array<Record<string, unknown>> }).data ?? [])
          .map((row) => Object.values(row)));

    await expect
      .poll(async () => (await behind()).length, { timeout: 60_000 })
      .toBe(15);

    const rows = await behind();
    expect(rows[0].length,
      'the nine fields the desk rings a carrier with').toBe(9);
    const tracking = rows.map((row) => String(row[0]));
    expect(tracking, 'the oldest delay is in the list').toContain('TRK-2026-000231');
    expect(tracking, 'and the newest').toContain('TRK-2026-003268');
    expect(new Set(tracking).size, 'fifteen different shipments').toBe(15);

    // One carrier holds a third of them, which is the point of opening the number at all.
    const perCarrier = new Map<string, number>();
    for (const row of rows) {
      const carrier = String(row[1]);
      perCarrier.set(carrier, (perCarrier.get(carrier) ?? 0) + 1);
    }
    expect(perCarrier.get('Swiftline Parcel'), 'Swiftline Parcel is late five times').toBe(5);
    expect(perCarrier.size, 'seven carriers in all').toBe(7);

    // And it is the fifteen, not the month: 188 shipments were booked in it.
    expect(rows.length, 'the month is not what opened').toBeLessThan(188);
    await inCard(frame, freight.id, '#btnDrillClose').click();
    await expect(inCard(frame, freight.id, '#cubeDrillModal'),
      'and it closes again').toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => difference(month.rows, await drawnRows(frame, freight.id), false),
        { timeout: 60_000 })
      .toBeNull();
  });

  test('(cube-stories) Billing Year to Date: the total restarts every January', async () => {
    test.setTimeout(30 * 60_000);
    const billing = cardOf('customer-invoices');
    const checks  = checksOf(billing.id);

    // Twenty-one months, each with what was invoiced in it and where the year stood after it.
    const ytd = checks.get('billing-ytd')!;
    await clickShowMe(frame, billing.id, 'billing-ytd');
    await expect
      .poll(async () => difference(ytd.rows, await drawnRows(frame, billing.id), false),
        { timeout: 60_000 })
      .toBeNull();

    // Made to go red: a running total that never restarts would carry 2025 into 2026 and put
    // 12,031,529.61 on the January 2026 row instead of the month's own 1,241,086.33, and the
    // December 2025 row would no longer be the whole of 2025.
    const drawn  = await drawnRows(frame, billing.id);
    const rowOf  = (month: string): unknown[] =>
      drawn.find((row) => String(row[0]).startsWith(month))!;
    const invoiced = (month: string): number => Number(rowOf(month)[1]);
    const yearToDate = (month: string): number => Number(rowOf(month)[2]);

    expect(drawn.length, 'twenty-one months of invoices').toBe(21);
    expect(yearToDate('2026-01'),
      "January's year to date is January itself").toBeCloseTo(invoiced('2026-01'), 2);
    expect(yearToDate('2026-01'),
      'and not the two years run together').toBeLessThan(2_000_000);
    expect(yearToDate('2025-12'),
      'December 2025 is the whole of 2025').toBeCloseTo(10_790_443.28, 2);
    expect(yearToDate('2026-09'),
      'September 2026 is the year so far').toBeCloseTo(9_621_071.76, 2);
    expect(yearToDate('2025-09'),
      'against the same month end a year earlier').toBeCloseTo(7_541_800.54, 2);

    // Each month end of 2026 is ahead of the same month end of 2025, which is the story.
    for (let m = 1; m <= 9; m++) {
      const suffix = `-${String(m).padStart(2, '0')}`;
      expect(yearToDate(`2026${suffix}`), `2026 is ahead at the end of month ${m}`)
        .toBeGreaterThan(yearToDate(`2025${suffix}`));
    }

    // And the column really is a running total: each month's is the one before it plus the
    // month, inside the year and never across it.
    for (const year of ['2025', '2026']) {
      const months = drawn
        .filter((row) => String(row[0]).startsWith(year))
        .map((row) => String(row[0]).slice(0, 7))
        .sort();
      let running = 0;
      for (const month of months) {
        running += invoiced(month);
        expect(yearToDate(month), `${month} is ${year} added up to it`).toBeCloseTo(running, 2);
      }
    }

    await expectNoCardWarns(frame);
  });

  test('(cube-stories) Category Margin: the cube says how every cell is written', async () => {
    test.setTimeout(30 * 60_000);
    const shop   = cardOf('online-sales');
    const checks = checksOf(shop.id);

    // The board pack, category by category: units, money and the two ratios.
    const board = checks.get('category-margin')!;
    await clickShowMe(frame, shop.id, 'category-margin');
    expect(difference(board.rows, await drawnRows(frame, shop.id), false),
      'the eight categories, with what each one sells and what it leaves').toBeNull();

    // The columns are headed by what the cube calls those measures.
    await expect(inCard(frame, shop.id, '#cubeRuntimeResult')).toContainText('Gross Margin');
    await expect(inCard(frame, shop.id, '#cubeRuntimeResult')).toContainText('Margin %');

    // Every cell is written the way the model says: euros as euros, because the cube declares
    // currency 'EUR'; the ratios as percentages, because they are declared percent; the units
    // as a plain number. Nothing here is a per-widget setting - a cell with no formatter at all
    // would read 1092301.89.
    const cellsOf = async (rowText: string): Promise<string[]> =>
      (await inCard(frame, shop.id, '#cubeRuntimeResult .tabulator-row')
        .filter({ hasText: rowText }).first()
        .locator('.tabulator-cell').allTextContents()).map((text) => text.trim());
    const displaysCells = await cellsOf('Displays');

    expect(displaysCells[1], 'the units, as a plain number').toBe('1,837');
    expect(displaysCells[2], 'net sales, in the cube\u2019s own currency').toBe('\u20AC1,092,301.89');
    expect(displaysCells[2], 'and not the bare number a missing formatter would show')
      .not.toBe('1092301.89');
    expect(displaysCells[3], 'what those sales cost').toBe('\u20AC749,529.97');
    expect(displaysCells[4], 'what they left').toBe('\u20AC342,771.92');
    expect(displaysCells[5], 'the margin, as a percentage of a fraction').toBe('31.38%');
    expect(displaysCells[6], 'and what was given away').toBe('3.02%');

    // The finding the board reads: Displays sell the most and leave the least, Audio the most.
    const drawn = await drawnRows(frame, shop.id);
    const marginOf = (category: string): number =>
      Number(drawn.find((row) => row[0] === category)![5]);
    const netOf = (category: string): number =>
      Number(drawn.find((row) => row[0] === category)![2]);
    const categories = drawn.map((row) => String(row[0]));
    expect(categories.sort((left, right) => netOf(right) - netOf(left))[0],
      'Displays is the biggest seller').toBe('Displays');
    expect(categories.sort((left, right) => marginOf(left) - marginOf(right))[0],
      'and has the thinnest margin of the eight').toBe('Displays');
    expect(categories.sort((left, right) => marginOf(right) - marginOf(left))[0],
      'Audio has the fattest').toBe('Audio');

    // Drop the field and the same six measures answer the whole shop. The total Margin % is the
    // margin of the totals, 34.07%, which the query works out - not 35.11%, the average of the
    // eight rows a table footer would take.
    const inAll = checks.get('category-margin/in-all')!;
    await clickShowMe(frame, shop.id, 'category-margin--in-all');
    await expect
      .poll(async () => difference(inAll.rows, await drawnRows(frame, shop.id), false),
        { timeout: 60_000 })
      .toBeNull();

    const totalsCells = (await inCard(frame, shop.id, '#cubeRuntimeResult .tabulator-row')
      .first().locator('.tabulator-cell').allTextContents()).map((text) => text.trim());
    expect(totalsCells[0], 'the units of the whole shop').toBe('14,438');
    expect(totalsCells[1], 'and its net sales').toBe('\u20AC3,571,889.64');
    expect(totalsCells[4], "the shop's margin, worked out by the query").toBe('34.07%');

    const averageOfTheRows = drawn.reduce((sum, row) => sum + Number(row[5]), 0) / drawn.length;
    expect(averageOfTheRows, 'the average of the eight rows is another number').toBeCloseTo(0.3511, 3);
    expect(Math.abs(averageOfTheRows - Number((await drawnRows(frame, shop.id))[0][4])),
      'and the total is not that average').toBeGreaterThan(0.01);

    await expectNoCardWarns(frame);
  });

  test('(cube-stories) Show Me on the shipped Northwind samples', async () => {
    test.setTimeout(30 * 60_000);
    for (const id of ['northwind-customers', 'northwind-hr', 'northwind-inventory',
                      'northwind-sales', 'northwind-warehouse']) {
      await walkEveryHint(frame, cardOf(id));
    }

    // These five read the shipped Northwind sample, not the demo data — so the panel says which
    // database the rows come from, and the SQL written for another one is that database's own:
    // MySQL quotes with backticks, which is the thing ANSI has no form for.
    const sales = cardOf('northwind-sales');
    await openSql(frame, sales.id);
    await expect(inCard(frame, sales.id, '#cubeRuntimeSql')).toContainText('sqlite');
    const rowsBefore = await drawnRows(frame, sales.id);

    await chooseSqlVendor(frame, sales.id, 'mysql');
    expect(await sqlText(frame, sales.id), 'MySQL quotes with backticks').toContain('`');
    expect(difference(rowsBefore, await drawnRows(frame, sales.id), false),
      'the rows are still the ones the sample database answered').toBeNull();
    await chooseSqlVendor(frame, sales.id, 'duckdb');
  });

  test('(cube-stories) Invoice Balances: who owes most, in that order', async () => {
    test.setTimeout(30 * 60_000);
    const balances = cardOf('invoice-balances');
    await walkEveryHint(frame, balances);

    // This cube's story is the order itself, so its check is compared in order — `walkEveryHint`
    // does that, because the hint says `ordered` — and the SQL says how the order is cut down to
    // ten. A SQL cube is read as a subquery, and the row limit is the one thing every engine
    // spells differently.
    await clickShowMe(frame, balances.id, 'who-owes-most');
    await openSql(frame, balances.id);

    const onDuckDb = await sqlText(frame, balances.id);
    expect(onDuckDb, 'a SQL cube is read from its own statement').toContain('cube_src');
    expect(onDuckDb).toContain('ORDER BY');
    expect(onDuckDb, 'most engines cut the answer down with LIMIT').toContain('LIMIT 10');

    await chooseSqlVendor(frame, balances.id, 'oracle');
    expect(await sqlText(frame, balances.id), 'Oracle takes the standard form')
      .toContain('FETCH FIRST 10 ROWS ONLY');

    await chooseSqlVendor(frame, balances.id, 'sqlserver');
    expect(await sqlText(frame, balances.id),
      'SQL Server takes neither: its limit is in the select list').toContain('TOP 10');

    await chooseSqlVendor(frame, balances.id, 'duckdb');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Student Progress, and the page as a whole.
  //
  // This cube asks something about each student's own enrollments, written as a
  // correlated subquery — the one thing ClickHouse will not run. A viewer who
  // picks ClickHouse in the SQL panel is told so in a sentence naming the field,
  // and nothing else about the card changes: the rows on the screen came from
  // the widget's own database and are still the rows its check says.
  //
  // And the claim the whole page makes about the cubes behind it: not one of
  // them has a warning, because the warnings block is drawn only where
  // the parser found something to say.
  //
  // Made to go red: `toContainText('CoursesTaken')` — a panel that answered a
  // refused vendor with an empty box, or a generator that wrote ClickHouse SQL
  // the database cannot run, would leave the sentence off.
  // ────────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Student Progress on a database that cannot answer it, and a page nothing warns about', async () => {
    test.setTimeout(30 * 60_000);
    const progress = cardOf('student-progress');
    await walkEveryHint(frame, progress);

    const clickHouseCannot = checksOf(progress.id).get('student-progress')!;
    expect(clickHouseCannot.refusedOn, 'this is the hint ClickHouse cannot answer').toContain('clickhouse');

    await clickShowMe(frame, progress.id, 'student-progress');
    const rowsOnItsOwnDatabase = await drawnRows(frame, progress.id);
    expect(difference(clickHouseCannot.rows, rowsOnItsOwnDatabase, false)).toBeNull();

    await openSql(frame, progress.id);
    await frame.locator('#cubeSqlVendor').selectOption('clickhouse');
    const refusal = inCard(frame, progress.id, '#cubeRuntimeSqlError');
    await expect(refusal, 'a database that cannot answer it says so, in a sentence')
      .toBeVisible({ timeout: 30_000 });
    // Naming the field to pick something else instead of a database error nobody can act on.
    await expect(refusal).toContainText('CoursesTaken');
    await expect(refusal).toContainText('correlated subquery');

    // The data is untouched: the SQL panel is about SQL, and these rows came from DuckDB.
    expect(difference(rowsOnItsOwnDatabase, await drawnRows(frame, progress.id), false)).toBeNull();
    await frame.locator('#cubeSqlVendor').selectOption('duckdb');
    await expect(refusal).toHaveCount(0, { timeout: 30_000 });

    // Every card on the page, including this one: nothing to warn about.
    await expectNoCardWarns(frame);
    // And the page is still the cards it opened as.
    await expect(frame.locator('.rb-cube-stories-root .card')).toHaveCount(CUBE_STORIES_CARDS.length);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Story 25, Customer Statement: a card that asks its viewer a question,
  //    and a link that answers it for them.
  //
  // Positive half, the whole chain: the page's own `customerId` is declared
  // once by the dashboard, asked for by the one card whose cube uses it, and
  // fixed by a share link - which is the statement a supplier sends a customer.
  //
  // Negative half: the recipient of that link edits the customer out of the
  // URL and still gets the customer the link names; and with no link at all
  // the same card answers for every customer, which is what an unanswered
  // question means here. Made to go red: if the URL won, the rows under
  // Southridge's link would be the `another-customer` check's rows, which are
  // in this file's assertions by name.
  // ───────────────────────────────────────────────────────────────────────────
  test('(cube-stories) Customer Statement: the link answers the card, and the URL cannot', async ({ browser }) => {
    test.setTimeout(20 * 60_000);

    const statement = cardOf('customer-statement');
    const checks = checksOf(statement.id);
    const southridge = checks.get('customer-statement')!;
    const vanArsdel = checks.get('customer-statement/another-customer')!;
    const everyCustomer = checks.get('customer-statement/all-customers')!;

    // ── The card asks, and only this card asks ──────────────────────────────
    await waitForCard(frame, statement.id);
    const select = inCard(frame, statement.id, '#cubeCardParams #customerId');
    await expect(select, 'the card asks its viewer which customer').toBeVisible({ timeout: 60_000 });
    await expect(select, 'and this link fixes nothing, so it is the viewer who answers')
      .toBeEnabled();
    await expect(inCard(frame, statement.id, '#cubeCardParams #customerId_lockedNote')).toHaveCount(0);

    for (const card of CUBE_STORIES_CARDS) {
      if (card.id === statement.id) continue;
      await expect(
        inCard(frame, card.id, '#cubeCardParamsBar'),
        `${card.id} asks nothing: a page-wide question would put a select on every card`,
      ).toHaveCount(0);
    }

    // ── Unanswered is every customer, answered is one ───────────────────────
    await answerCardParams(frame, statement.id, { customerId: '' });
    await clickShowMe(frame, statement.id, 'customer-statement--all-customers');
    expect(difference(everyCustomer.rows, await drawnRows(frame, statement.id), false),
      'nobody picked: the whole book, by status').toBeNull();

    await answerCardParams(frame, statement.id, { customerId: '26' });
    await clickShowMe(frame, statement.id, 'customer-statement');
    const picked = await drawnRows(frame, statement.id);
    expect(difference(southridge.rows, picked, false),
      "Southridge Video SpA's own statement").toBeNull();
    expect(difference(everyCustomer.rows, picked, false),
      'and it is nothing like the whole book').not.toBeNull();

    // ── The same card through a link that has already answered ──────────────
    const linked = await createCubeStoriesShareLink(adminFetch, BASE_URL, { customerId: 26 });
    const recipient = await browser.newPage();
    try {
      // The recipient edits the URL: another customer, on the query string, on purpose.
      await recipient.goto(
        `${BASE_URL}/dashboard/${CUBE_STORIES_REPORT_ID}`
        + `?token=${encodeURIComponent(linked)}&customerId=7`,
      );
      const theirs = recipient.mainFrame();
      await expect(theirs.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
      await waitForCard(theirs, statement.id);

      const fixed = inCard(theirs, statement.id, '#cubeCardParams #customerId');
      await expect(fixed, 'the link has answered, so the control is dead')
        .toBeDisabled({ timeout: 60_000 });
      await expect(fixed, 'showing the customer the link names, not the one in the URL')
        .toHaveValue('26');
      await expect(inCard(theirs, statement.id, '#cubeCardParams option[value="26"]'))
        .toContainText('Southridge');
      await expect(
        inCard(theirs, statement.id, '#cubeCardParams #customerId_lockedNote'),
        'and saying why it is dead',
      ).toContainText('Fixed by this link');

      await clickShowMe(theirs, statement.id, 'customer-statement');
      const throughTheLink = await drawnRows(theirs, statement.id);
      expect(difference(southridge.rows, throughTheLink, false),
        "the link's customer is the one answered for, whatever the URL says").toBeNull();
      expect(difference(vanArsdel.rows, throughTheLink, false),
        "and the URL's customer is nowhere in the answer").not.toBeNull();

      // The lock is this card's question, not the page's: every other card is the page
      // everybody else sees.
      const shop = cardOf('online-sales');
      await waitForCard(theirs, shop.id);
      await clickShowMe(theirs, shop.id, 'revenue-mix');
      expect(difference(checksOf(shop.id).get('revenue-mix')!.rows,
        await drawnRows(theirs, shop.id), false),
        'the shop card answers the same under a link that fixes a customer').toBeNull();
      await expectNoCardWarns(theirs);
    } finally {
      await recipient.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────────
  // The other half of the bold field names (D8): the component writes the sentence as HTML, so
  // the question is what a sentence that carries markup of its own does. It is escaped first and
  // only `**...**` becomes a `<strong>`, so `<b>` reaches the reader as four characters.
  //
  // The sentence is put there the way the page gets every sentence — in the cube's `/meta`
  // answer — so this is the component reading a hints file, not a test reaching inside it.
  //
  // Made to go red: a `{@html ask.text}` with no escaping would turn `<b>` into bold and
  // `expect(injected.bolds).toEqual(['Units'])` would find two bold pieces instead of one.
  // ───────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
  // D9: the cube on one half, its stories on the other, the answer under both.
  //
  // Positive half: on the Sales Pipeline card the field tree and its details toggle are in the
  // left column and the questions in the right one, side by side, with the answer under both; a
  // Show Me pressed on the right ticks fields on the left and the rows under both change to that
  // story's rows, and the story pressed is marked while they are its rows.
  //
  // Negative half: a tick by hand takes the mark off, because the selection is then the reader's.
  // (A tile with no stories has no right column at all: sample 22's live tile, in samples.spec.)
  //
  // Made to go red: `expect(difference(stage.rows, afterShowMe, false)).toBeNull()` — the columns
  // could be side by side and the tile still be the old one if pressing Show Me on the right left
  // the rows below untouched, which is the defect the owner described.
  // ────────────────────────────────────────────────────────────────────────────
  test('(cube-stories) the cube on one half, its stories on the other, the answer under both', async () => {
    test.setTimeout(10 * 60_000);

    const pipeline = cardOf('sales-pipeline');
    await waitForCard(frame, pipeline.id);

    const laidOut = async () => inCard(frame, pipeline.id, 'rb-cube-renderer').evaluate((host: Element) => {
      const root: ParentNode = (host as HTMLElement).shadowRoot ?? host;
      const box = (selector: string) => {
        const element = root.querySelector(selector);
        if (!element) return null;
        const rect = (element as HTMLElement).getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const fields = root.querySelector('.rb-cube-fields');
      const stories = root.querySelector('.rb-cube-stories');
      return {
        fields: box('.rb-cube-fields'),
        stories: box('.rb-cube-stories'),
        result: box('#cubeRuntimeResult'),
        treeOnTheLeft: !!fields?.querySelector('.rb-tree-field'),
        toggleOnTheLeft: !!fields?.querySelector('#chk-show-everything'),
        questionsOnTheRight: !!stories?.querySelector('#cubeHints .rb-hint'),
        marked: Array.from(root.querySelectorAll('.rb-hint-asked')).map((one) => one.id),
      };
    });

    const halves = await laidOut();
    expect(halves.fields, 'the cube has a half of its own').not.toBeNull();
    expect(halves.stories, 'and its stories have the other half').not.toBeNull();
    expect(halves.treeOnTheLeft, 'the field tree is in the cube half').toBe(true);
    expect(halves.toggleOnTheLeft, 'and so is the toggle that details it (D12)').toBe(true);
    expect(halves.questionsOnTheRight, 'the questions are in the stories half').toBe(true);
    expect(halves.stories!.left, 'the stories are to the right of the cube, not under it')
      .toBeGreaterThanOrEqual(halves.fields!.right - 1);
    expect(Math.abs(halves.stories!.top - halves.fields!.top),
      'and they start level with each other, both in view at once').toBeLessThan(8);
    expect(halves.result, 'the answer is drawn').not.toBeNull();
    expect(halves.result!.top, 'the answer is under both halves, full width')
      .toBeGreaterThanOrEqual(Math.max(halves.fields!.bottom, halves.stories!.bottom) - 1);
    expect(halves.result!.bottom - halves.fields!.top,
      'and the cube, its stories and its answer fit in a screen together').toBeLessThan(1080);

    // ── Show Me on the right changes the ticks on the left and the rows below ──
    const checks = checksOf(pipeline.id);
    const stage = checks.get('deals-by-stage')!;
    const value = checks.get('deals-and-value')!;

    await clickShowMe(frame, pipeline.id, 'deals-and-value');
    expect(difference(value.rows, await drawnRows(frame, pipeline.id), false),
      'the card answers the first story asked').toBeNull();

    await clickShowMe(frame, pipeline.id, 'deals-by-stage');
    await expectTreeShows(frame, pipeline.id, asksOf(pipeline).find((a) => a.check === 'deals-by-stage')!.query);
    const afterShowMe = await drawnRows(frame, pipeline.id);
    expect(difference(stage.rows, afterShowMe, false),
      'a story pressed on the right is answered under both halves').toBeNull();
    expect(difference(value.rows, afterShowMe, false),
      'and the rows really changed: they are no longer the story before it').not.toBeNull();

    const asked = await laidOut();
    expect(asked.marked, 'the story the reader asked last is the marked one')
      .toEqual(['hint-deals-by-stage']);

    // ── A tick by hand: the selection is the reader's own, so the mark goes ────
    await inCard(frame, pipeline.id, '#meas-Deals').click();
    await expect
      .poll(async () => (await laidOut()).marked.length, { timeout: 30_000 })
      .toBe(0);
  });

  test('(cube-stories) a hints file cannot put markup of its own on the page', async ({ browser }) => {
    test.setTimeout(10 * 60_000);

    const shop = cardOf('online-sales');
    const marked = await browser.newPage();
    try {
      // One sentence, rewritten on its way to the browser: a pair of asterisks the author meant,
      // and a `<b>` tag the author did not.
      await marked.route('**/cube/*/meta', async (route) => {
        const answer = await route.fetch();
        const meta = await answer.json();
        if (Array.isArray(meta?.hints) && meta.hints.length > 0) {
          meta.hints[0] = {
            ...meta.hints[0],
            text: 'Tick **Units** and <b>Country</b> & "Net Sales".',
            variants: [],
          };
        }
        await route.fulfill({ response: answer, json: meta });
      });

      await marked.goto(
        `${BASE_URL}/dashboard/${CUBE_STORIES_REPORT_ID}?token=${encodeURIComponent(shareToken)}`,
      );
      const theirs = marked.mainFrame();
      await expect(theirs.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
      await waitForCard(theirs, shop.id);

      const first = asksOf(shop)[0];
      const line = inCard(theirs, shop.id, `#hint-${first.id} .rb-hint-text`);
      await expect(line).toBeVisible({ timeout: 60_000 });
      const injected = await line.evaluate((element: Element) => ({
        shown: (element.textContent ?? '').trim(),
        bolds: Array.from(element.querySelectorAll('strong, b')).map((one) => (one.textContent ?? '').trim()),
      }));

      expect(injected.bolds, 'the field name the author wrote in bold, and nothing else, is bold')
        .toEqual(['Units']);
      expect(injected.shown, 'the tag the hints file wrote is four characters on the screen')
        .toBe('Tick Units and <b>Country</b> & "Net Sales".');
    } finally {
      await marked.close();
    }
  });
});

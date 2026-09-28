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
  CUBE_STORIES_REPORT_ID,
  cardOf,
  checksOf,
  chooseSqlVendor,
  clickShowMe,
  createCubeStoriesShareLink,
  difference,
  drawnRows,
  embedTokenOf,
  expectNoCardWarns,
  expectTheWholePage,
  expectTreeShows,
  hideCode,
  inCard,
  openCode,
  openSql,
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

// One page, opened once: fifteen live cubes are a heavy page and every test asks the same page
// different questions, in order.
test.describe.configure({ mode: 'serial' });

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
  // fifteen cards, each drawing its own rows from its own live cube, with the
  // cube's own definition behind View Code and its SQL — for any of eight
  // databases — behind View SQL.
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

    await inCard(frame, deals.id, '#chk-dim-LeadSource').check();
    await expect(inCard(frame, deals.id, '#chk-dim-LeadSource')).toBeChecked();

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

    // ── The SQL panel: eight databases, and the choice is the page's ────────
    await openSql(frame, deals.id);
    await expect(inCard(frame, deals.id, '#cubeRuntimeSqlVendor option')).toHaveCount(EVERY_VENDOR.length);
    expect(await inCard(frame, deals.id, '#cubeRuntimeSqlVendor option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
      .toEqual(EVERY_VENDOR);
    await expect(inCard(frame, deals.id, '#cubeRuntimeSqlVendor'),
      'the panel starts on the database the rows really come from').toHaveValue('duckdb');
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql')).toContainText('DuckDB');

    const sqlOnDuckDb = await sqlText(frame, deals.id);
    const rowsBefore = await drawnRows(frame, deals.id);

    await chooseSqlVendor(frame, deals.id, 'oracle');
    const sqlOnOracle = await sqlText(frame, deals.id);
    expect(sqlOnOracle, 'another database is another statement').not.toBe(sqlOnDuckDb);
    await expect(inCard(frame, deals.id, '#cubeRuntimeSql')).toContainText('Oracle');
    // View SQL writes a statement; it does not run one. The rows on the screen are still the ones
    // the widget's own connection answered.
    expect(difference(rowsBefore, await drawnRows(frame, deals.id), false)).toBeNull();

    // The choice belongs to the page, not to one card: every other card follows it.
    const tickets = cardOf('support-desk');
    await waitForCard(frame, tickets.id);
    await openSql(frame, tickets.id);
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSqlVendor')).toHaveValue('oracle');
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSql')).toContainText('Oracle');

    await chooseSqlVendor(frame, deals.id, 'duckdb');
    await expect(inCard(frame, tickets.id, '#cubeRuntimeSqlVendor')).toHaveValue('duckdb');

    // ── A card with nothing ticked says what to do ──────────────────────────
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

    // A request that tries to bring its own SQL or its own database is answered from the widget's
    // entry alone, exactly as if it had asked for nothing of the sort.
    const plain = await page.request.post(
      `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/${deals.id}/query`,
      { headers: carrying, data: { dimensions: ['Stage'], measures: ['Deals', 'DealValue'] } });
    const smuggled = await page.request.post(
      `${BASE_URL}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/${deals.id}/query`,
      { headers: carrying, data: {
        dimensions: ['Stage'], measures: ['Deals', 'DealValue'],
        sql: 'SELECT 1', connectionId: 'rbt-sample-northwind-sqlite-4f2',
      } });
    expect(smuggled.status()).toBe(plain.status());
    expect((await smuggled.json()).rows).toEqual((await plain.json()).rows);

    // Put the page back the way it opens, for the walks that follow.
    await page.reload();
    frame = page.mainFrame();
    await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
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
    // be asking about fields it has not got.
    for (const id of ['online-sales', 'student-enrollments', 'customer-invoices', 'customer-payments']) {
      await walkEveryHint(frame, cardOf(id));
    }
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
  // the fifteen has a warning, because the warnings block is drawn only where
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
    await inCard(frame, progress.id, '#cubeRuntimeSqlVendor').selectOption('clickhouse');
    const refusal = inCard(frame, progress.id, '#cubeRuntimeSqlError');
    await expect(refusal, 'a database that cannot answer it says so, in a sentence')
      .toBeVisible({ timeout: 30_000 });
    // Naming the field to pick something else instead of a database error nobody can act on.
    await expect(refusal).toContainText('CoursesTaken');
    await expect(refusal).toContainText('correlated subquery');

    // The data is untouched: the SQL panel is about SQL, and these rows came from DuckDB.
    expect(difference(rowsOnItsOwnDatabase, await drawnRows(frame, progress.id), false)).toBeNull();
    await inCard(frame, progress.id, '#cubeRuntimeSqlVendor').selectOption('duckdb');
    await expect(refusal).toHaveCount(0, { timeout: 30_000 });

    // Every card on the page, including this one: nothing to warn about.
    await expectNoCardWarns(frame);
    // And the page is still the fifteen cards it opened as.
    await expect(frame.locator('.rb-cube-stories-root .card')).toHaveCount(CUBE_STORIES_CARDS.length);
  });
});

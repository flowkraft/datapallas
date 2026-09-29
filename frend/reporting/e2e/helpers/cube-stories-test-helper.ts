// ═══════════════════════════════════════════════════════════════════════════════
// cube-stories-test-helper.ts
// The Cube Stories page, checked the way a visitor meets it (design part 8).
//
// The same steps run twice and must not be written twice:
//   • cube-stories.spec.ts        — the page inside DataPallas, opened with a
//                                   share link, in the page's own main frame;
//   • cube-stories.public.ts      — the very same page inside the iframe on
//                                   datapallas.com, in the iframe's frame.
//
// So every step here takes a Playwright `Frame` and uses Playwright's own
// locators and `expect`. A `FluentTester` drives a whole `Page` and cannot
// reach into an iframe, which is why none is used.
//
// WHAT IS TRUE, AND WHERE IT COMES FROM
//
// Nothing in this file states a number. A card's questions are that cube's own
// `hints.json` — the same file the server reads to build the Show Me buttons —
// and the rows those questions must answer are
// `e2e/_resources/cube-checks/{cubeId}.checks.json`, the same file
// `GeneratedSqlAllVendorsTest` checks its generated SQL against on every
// vendor. The e2e and the Java loop therefore check the same rows for the same
// hints, and a hint added to a cube later (Phase 4) is walked by this helper
// with no new e2e.
//
// The rows are compared by the same rules as that Java loop: numbers within
// 0.01, dates by the `YYYY-MM-DD` they start with, NULL as NULL, and as a SET
// unless the hint's query says `ordered` — where the rows fall is not part of a
// truth except in the hints that are about an order.
//
// The helper sends no SQL of its own: W2 takes none, and the same steps run on
// datapallas.com, where there is nothing to send it to.
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Frame, type Locator, type Response } from '@playwright/test';

const fs = require('fs');
const path = require('path');

import {
  E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
  E2E_RESOURCES_PATH,
} from '../utils/paths';

// ── Where things are ──────────────────────────────────────────────────────────

/** The report the page is published as, and the id in every element id below. */
export const CUBE_STORIES_REPORT_ID = 'g-cube-stories';

/** The connection the demo data lives on, and the one the page re-seeds. */
export const CUBE_DEMO_CONNECTION = 'rbt-sample-northwind-duckdb-4f2';

/**
 * The demo data is seeded once and its dates are moved to the day it was
 * seeded, so a package built on any day would answer different months. The
 * spec seeds it again on a fixed day, which is the day the checks were
 * computed for (Phase 1b, A3 and B1).
 */
export const CUBE_DEMO_SEED_PARAMS = { wipe: true, today: '2026-09-30' };

const SAMPLES_CUBES_PATH = path.join(
  E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
  'db-template/config/samples-cubes',
);

const CUBE_DEMO_SEED_SCRIPT_PATH = path.join(
  E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
  'db-template/db/scripts/cube-demo-data.groovy',
);

const CUBE_CHECKS_PATH = path.join(E2E_RESOURCES_PATH, 'cube-checks');

// ── The cards ─────────────────────────────────────────────────────────────────

/**
 * One card of the page.
 *
 * `id` is the cube id, which is also the widget's component id and the id of
 * the card's `<div>` — one name, so `#cube-{id}` and the endpoints under
 * `…/cube/{id}/…` cannot drift apart.
 *
 * `file` is the cube file the cube is declared in. It is the cube id for every
 * cube but the two the `customer-billing` file declares together, and
 * `cubeName` is what that file calls this cube — empty where the file declares
 * only one, exactly as `CubeHints` reads it.
 */
export interface CubeCard {
  id: string;
  title: string;
  area: string;
  domain: string;
  file: string;
  cubeName: string;
}

/**
 * The cubes DataPallas ships, in the order the page shows them: by business
 * area, and inside an area by the cube's own name. One card per cube id, so
 * the two cubes of `customer-billing` are two cards, and so are the two of
 * `online-sales`.
 */
export const CUBE_STORIES_CARDS: CubeCard[] = [
  { id: 'sales-pipeline',       title: 'Sales Pipeline',               area: 'CRM & Sales',            domain: 'crm-sales',           file: 'sales-pipeline',      cubeName: '' },
  { id: 'support-desk',         title: 'Support Desk',                 area: 'Customer Support',       domain: 'customer-support',    file: 'support-desk',        cubeName: '' },
  { id: 'student-enrollments',  title: 'Student Enrollments',          area: 'Education',              domain: 'education',           file: 'student-enrollments', cubeName: '' },
  { id: 'student-progress',     title: 'Student Progress',             area: 'Education',              domain: 'education',           file: 'student-progress',    cubeName: '' },
  { id: 'customer-invoices',    title: 'Customer Invoices',            area: 'ERP & Finance',          domain: 'erp-finance',         file: 'customer-billing',    cubeName: 'customer-invoices' },
  { id: 'customer-payments',    title: 'Customer Payments',            area: 'ERP & Finance',          domain: 'erp-finance',         file: 'customer-billing',    cubeName: 'customer-payments' },
  { id: 'invoice-balances',     title: 'Invoice Balances',             area: 'ERP & Finance',          domain: 'erp-finance',         file: 'invoice-balances',    cubeName: '' },
  { id: 'customer-statement',   title: 'Customer Statement',           area: 'ERP & Finance',          domain: 'erp-finance',         file: 'invoice-balances',    cubeName: 'customer-statement' },
  { id: 'northwind-customers',  title: 'Northwind Customer Management', area: 'Northwind',             domain: 'northwind',           file: 'northwind-customers', cubeName: '' },
  { id: 'northwind-hr',         title: 'Northwind Human Resources',    area: 'Northwind',              domain: 'northwind',           file: 'northwind-hr',        cubeName: '' },
  { id: 'northwind-inventory',  title: 'Northwind Product Inventory',  area: 'Northwind',              domain: 'northwind',           file: 'northwind-inventory', cubeName: '' },
  { id: 'northwind-sales',      title: 'Northwind Sales Analysis',     area: 'Northwind',              domain: 'northwind',           file: 'northwind-sales',     cubeName: '' },
  { id: 'northwind-warehouse',  title: 'Northwind Sales Warehouse',    area: 'Northwind',              domain: 'northwind',           file: 'northwind-warehouse', cubeName: '' },
  { id: 'online-sales',         title: 'Online Sales',                 area: 'Retail & E-commerce',    domain: 'retail-ecommerce',    file: 'online-sales',        cubeName: '' },
  { id: 'shop-for-a-period',    title: 'Sales for a Period',           area: 'Retail & E-commerce',    domain: 'retail-ecommerce',    file: 'online-sales',        cubeName: 'shop-for-a-period' },
  { id: 'depot-network',        title: 'Depot Network',                area: 'Transport & Logistics',  domain: 'transport-logistics', file: 'depot-network',       cubeName: '' },
  { id: 'freight-shipments',    title: 'Freight Shipments',            area: 'Transport & Logistics',  domain: 'transport-logistics', file: 'freight-shipments',   cubeName: '' },
];

export function cardOf(cubeId: string): CubeCard {
  const found = CUBE_STORIES_CARDS.find((c) => c.id === cubeId);
  if (!found) throw new Error(`no such card on the Cube Stories page: ${cubeId}`);
  return found;
}

// ── The truths: the hints, and the rows they must answer ──────────────────────

/** One Show Me of a card: a question, what to click, and the selection itself. */
export interface Ask {
  /** What the page's markup is built from: `#hint-{id}`, `#btnShowMe-{id}`. */
  id: string;
  /** What the checks file calls the same ask: `hint` or `hint/variant`. */
  check: string;
  question: string;
  text: string;
  query: CubeQuery;
}

export interface CubeQuery {
  dimensions?: string[];
  measures?: string[];
  segments?: string[];
  filters?: Array<{ member: string; values?: unknown[]; from?: string; to?: string }>;
  /** Where the order IS the answer (a top ten, a story about ranking). */
  ordered?: boolean;
  [key: string]: unknown;
}

/** One check: the rows an ask must answer, and the vendors that cannot answer it. */
export interface CubeCheck {
  hint: string;
  rows: unknown[][];
  refusedOn?: string[];
  source?: string;
  /**
   * The answers the card's own question needs for these rows to be the answer (story 25). The
   * Java vendor loop binds them; here the viewer gives them, in the card's parameter bar - the
   * same values, reaching the same conditions.
   */
  locked?: Record<string, unknown>;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * The asks of one card, flattened exactly as `CubeHints.of` flattens them for
 * the page: the hint first, then each of its variants, in the file's order;
 * a variant keeps the hint's question and brings its own sentence; `cubeName`
 * is taken out of the query, because a live cube answers about the cube its
 * dashboard declares and would refuse the name.
 *
 * Reading the shipped file — not a copy of it — is the point: this is the same
 * file the server reads, so the two cannot disagree about what a card offers.
 */
export function asksOf(card: CubeCard): Ask[] {
  const file = path.join(SAMPLES_CUBES_PATH, card.domain, `${card.file}-hints.json`);
  const hints = readJson<Array<Record<string, any>>>(file);

  const asks: Ask[] = [];
  for (const hint of hints) {
    const query = { ...(hint.query ?? {}) } as CubeQuery;
    if ((query.cubeName ?? '') !== card.cubeName) continue;

    const id = String(hint.id);
    asks.push(ask(id, id, String(hint.question), String(hint.text), query));

    for (const variant of (hint.variants ?? []) as Array<Record<string, any>>) {
      asks.push(ask(
        `${id}--${variant.id}`,
        `${id}/${variant.id}`,
        String(hint.question),
        String(variant.text),
        { ...(variant.query ?? {}) } as CubeQuery,
      ));
    }
  }
  if (asks.length === 0) throw new Error(`${card.id} has no hints in ${file}`);
  return asks;
}

function ask(id: string, check: string, question: string, text: string, query: CubeQuery): Ask {
  const asked = { ...query };
  delete asked.cubeName;
  return { id, check, question, text, query: asked };
}

/** Every check of one cube, by the name the hints file gives the ask. */
export function checksOf(cubeId: string): Map<string, CubeCheck> {
  const file = path.join(CUBE_CHECKS_PATH, `${cubeId}.checks.json`);
  const checks = readJson<CubeCheck[]>(file);
  return new Map(checks.map((check) => [check.hint, check]));
}

/**
 * Every hint has its check and every check its hint.
 *
 * Either one missing is red, and deliberately so: a hint nobody checks is a
 * question with no answer, and a check nobody asks is a truth this page stopped
 * telling. It is also what keeps the walk honest — a cube whose hints file was
 * emptied would otherwise "pass" by having nothing to click.
 */
export function expectHintsAndChecksAgree(card: CubeCard): { asks: Ask[]; checks: Map<string, CubeCheck> } {
  const asks = asksOf(card);
  const checks = checksOf(card.id);

  const asked = asks.map((a) => a.check).sort();
  const checked = [...checks.keys()].sort();
  expect(asked, `${card.id}: every hint has a check and every check a hint`).toEqual(checked);

  return { asks, checks };
}

// ── Comparing rows, by the same rules as the Java vendor loop ─────────────────

/** A value as the comparison sees it, exactly as `GeneratedSqlAllVendorsTest.normalise` does. */
function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value);
  if (
    text.length >= 10 && text[4] === '-' && text[7] === '-' &&
    /\d/.test(text[0]) && /\d/.test(text[9])
  ) {
    return text.slice(0, 10);
  }
  return text;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) || String(value).trim() === '' ? null : parsed;
}

function same(expected: unknown, actual: unknown): boolean {
  if (expected === null || actual === null) return expected === actual;
  const left = asNumber(expected);
  const right = asNumber(actual);
  if (left !== null && right !== null) return Math.abs(left - right) <= 0.01;
  return String(expected) === String(actual);
}

function sameRow(expected: unknown[], actual: unknown[]): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false;
  return expected.every((value, i) => same(normalise(value), normalise(actual[i])));
}

/** Null when the rows are the ones expected, otherwise the one line that says what went wrong. */
export function difference(expected: unknown[][], actual: unknown[][], ordered: boolean): string | null {
  if (expected.length !== actual.length) {
    return `expected ${expected.length} rows, got ${actual.length}${sideBySide(expected, actual)}`;
  }
  if (ordered) {
    for (let i = 0; i < expected.length; i++) {
      if (!sameRow(expected[i], actual[i])) {
        return `row ${i + 1} differs, and this check is ordered${sideBySide(expected, actual)}`;
      }
    }
    return null;
  }
  const unmatched = [...actual];
  for (const want of expected) {
    const at = unmatched.findIndex((row) => sameRow(want, row));
    if (at < 0) return `no row answers ${JSON.stringify(want)}${sideBySide(expected, actual)}`;
    unmatched.splice(at, 1);
  }
  return null;
}

function sideBySide(expected: unknown[][], actual: unknown[][]): string {
  return `\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`;
}

function show(rows: unknown[][]): string {
  if (rows.length === 0) return 'no rows';
  const shown = rows.slice(0, 10).map((row) => JSON.stringify(row)).join(', ');
  return rows.length > 10 ? `${shown}, … ${rows.length - 10} more` : shown;
}

/** The rows of an answer as lists, in the order the answer put its columns in. */
export function asLists(rows: Array<Record<string, unknown>>): unknown[][] {
  return rows.map((row) => Object.values(row));
}

// ── Reaching into one card ────────────────────────────────────────────────────

/** Everything is reached inside its card, because every card carries the same ids. */
export function inCard(frame: Frame, cubeId: string, selector: string): Locator {
  return frame.locator(`#cube-${cubeId} ${selector}`);
}

export function cardRoot(frame: Frame, cubeId: string): Locator {
  return frame.locator(`#cube-${cubeId}`);
}

/** The card is on the page, its component has mounted and its first answer is drawn. */
export async function waitForCard(frame: Frame, cubeId: string, timeout = 60_000): Promise<void> {
  await expect(cardRoot(frame, cubeId)).toBeVisible({ timeout });
  await expect(inCard(frame, cubeId, 'rb-cube-renderer')).toHaveCount(1, { timeout });
  await expect(inCard(frame, cubeId, '#cubeRuntimeResult')).toBeVisible({ timeout });
  await expect(inCard(frame, cubeId, '#cubeRuntimeResult')).not.toContainText('Answering', { timeout });
}

/**
 * The rows this card is showing, read off the widget that is drawing them.
 *
 * Not fetched again: what is asserted is what a visitor can see, and asking the
 * server a second question would prove nothing about the page. Tabulator draws
 * the rows it was handed, so its `data` is the answer as drawn; a card showing
 * a map or a chart is read the same way from that widget.
 */
export async function drawnRows(frame: Frame, cubeId: string): Promise<unknown[][]> {
  for (const widget of ['rb-tabulator', 'rb-map', 'rb-chart']) {
    const drawing = inCard(frame, cubeId, `#cubeRuntimeResult ${widget}`);
    if (await drawing.count() > 0) {
      const rows = await drawing.first().evaluate((el) => (el as unknown as { data: Array<Record<string, unknown>> }).data);
      return asLists(rows ?? []);
    }
  }
  throw new Error(`the ${cubeId} card is drawing no answer at all`);
}

/** The short-lived credential the page was served with — the only one its widgets have. */
export async function embedTokenOf(frame: Frame, cubeId: string): Promise<string> {
  const token = await inCard(frame, cubeId, 'rb-cube-renderer').getAttribute('embed-token');
  expect(token, 'the page hands its widgets a credential').toBeTruthy();
  return token as string;
}

// ── The Show Me walk ──────────────────────────────────────────────────────────

/** The base name of a member: `CreatedDate.month` is ticked as `CreatedDate`. */
function memberName(member: string): string {
  return member.split('.')[0];
}

/** The bucket a member asks for, where it asks for one: `month` of `CreatedDate.month`. */
function granularityOf(member: string): string | null {
  const parts = member.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

/**
 * The box that ticks a member. A dimension, a segment and a level of a
 * hierarchy are three different rows of the tree with three different ids, and
 * a hint names them all the same way, so the box is whichever of the three
 * this cube has.
 */
async function boxOf(frame: Frame, cubeId: string, member: string, kind: 'dim' | 'meas'): Promise<Locator> {
  const name = memberName(member);
  const candidates = kind === 'meas'
    ? [`#chk-meas-${name}`]
    : [`#chk-dim-${name}`, `#chk-seg-${name}`, `#chk-hier-${member.replace('.', '-')}`];

  for (const selector of candidates) {
    const box = inCard(frame, cubeId, selector);
    if (await box.count() > 0) return box;
  }
  throw new Error(`the ${cubeId} card has no box for ${member} (tried ${candidates.join(', ')})`);
}

/** Every box this card has ticked, as the tree's own ids say it. */
async function tickedNow(frame: Frame, cubeId: string): Promise<string[]> {
  return cardRoot(frame, cubeId).evaluate((card) =>
    Array.from(card.querySelectorAll('input[type="checkbox"]:checked'))
      .map((box) => (box as HTMLInputElement).id)
      .filter((id) => id.startsWith('chk-dim-') || id.startsWith('chk-meas-')
        || id.startsWith('chk-seg-') || id.startsWith('chk-hier-'))
      .sort());
}

/**
 * Click a hint's Show Me and wait for the answer it asks for.
 *
 * The click is the whole point — nothing here fills the tree by hand — and the
 * wait is on the question the click sends, not on a timeout: `/query` for this
 * card, then the drawn rows catching up with what came back.
 */
export async function clickShowMe(frame: Frame, cubeId: string, askId: string): Promise<Array<Record<string, unknown>>> {
  const page = frame.page();
  const showMe = inCard(frame, cubeId, `#hint-${askId} #btnShowMe-${askId}`);
  await expect(showMe, `the ${cubeId} card offers a Show Me for ${askId}`).toBeVisible({ timeout: 30_000 });

  const answered: Promise<Response> = page.waitForResponse(
    (r) => r.url().includes(`/cube/${cubeId}/query`) && r.request().method() === 'POST',
    { timeout: 90_000 },
  );
  await showMe.click();
  const response = await answered;
  expect(response.status(), `${cubeId}/${askId}: the page's own question was answered`).toBe(200);
  const body = await response.json();
  expect(body.truncated, `${cubeId}/${askId}: a cut answer is not the hint's answer`).toBeFalsy();

  // What came back is not yet what is drawn; the assertion is on what is drawn.
  await expect
    .poll(async () => (await drawnRows(frame, cubeId)).length, { timeout: 60_000 })
    .toBe((body.rows ?? []).length);

  return body.rows ?? [];
}

/**
 * Show Me replaces the selection, it does not add to it: after the click the
 * tree shows the hint's fields and only those, with the bucket the hint asks
 * for and the filters it carries.
 */
export async function expectTreeShows(frame: Frame, cubeId: string, query: CubeQuery): Promise<void> {
  const dimensions = query.dimensions ?? [];
  const measures = query.measures ?? [];
  const segments = query.segments ?? [];

  for (const member of [...dimensions, ...segments]) {
    await expect(await boxOf(frame, cubeId, member, 'dim'), `${cubeId}: ${member} is ticked`).toBeChecked();
    const bucket = granularityOf(member);
    if (bucket) {
      await expect(inCard(frame, cubeId, `#gran-${memberName(member)}`)).toHaveValue(bucket);
    }
  }
  for (const measure of measures) {
    await expect(await boxOf(frame, cubeId, measure, 'meas'), `${cubeId}: ${measure} is ticked`).toBeChecked();
  }

  // And nothing else: a Show Me that added to what was there would leave more
  // boxes ticked than the hint names.
  const wanted = [...dimensions, ...segments, ...measures].length;
  expect((await tickedNow(frame, cubeId)).length, `${cubeId}: Show Me replaced the selection`).toBe(wanted);

  for (const filter of query.filters ?? []) {
    await expect(inCard(frame, cubeId, `#chipFilter-${filter.member}`)).toBeVisible({ timeout: 15_000 });
  }
}

/**
 * Answer the questions a card asks of its own viewer (story 25's customer select), in the card's
 * parameter bar. An empty string is an answer too: it is what "all of them" is written as, and
 * what puts the card back the way the next ask needs it.
 */
export async function answerCardParams(
  frame: Frame,
  cubeId: string,
  answers: Record<string, string>,
): Promise<void> {
  for (const [name, value] of Object.entries(answers)) {
    const control = inCard(frame, cubeId, `#cubeCardParams #${name}`);
    await expect(control, `${cubeId}: the card asks its viewer for ${name}`)
      .toBeVisible({ timeout: 30_000 });
    await control.selectOption(value);
  }
}

/**
 * What to answer this card with before one ask: every name any of this card's checks fixes, set
 * to this check's own value or cleared. A card whose checks fix nothing is left alone, so the
 * fourteen cards that ask their viewer nothing walk exactly as before.
 */
function answersFor(check: CubeCheck, checks: Map<string, CubeCheck>): Record<string, string> {
  const asked = new Set<string>();
  for (const one of checks.values()) for (const name of Object.keys(one.locked ?? {})) asked.add(name);

  const answers: Record<string, string> = {};
  for (const name of asked) answers[name] = String((check.locked ?? {})[name] ?? '');
  return answers;
}

/** One ask, end to end: click it, check the tree it filled, check the rows it answered. */
export async function checkOneAsk(
  frame: Frame,
  card: CubeCard,
  ask: Ask,
  checks: Map<string, CubeCheck>,
): Promise<void> {
  const check = checks.get(ask.check);
  expect(check, `${card.id}: ${ask.check} has a check`).toBeTruthy();

  await answerCardParams(frame, card.id, answersFor(check as CubeCheck, checks));
  await clickShowMe(frame, card.id, ask.id);
  await expectTreeShows(frame, card.id, ask.query);

  const drawn = await drawnRows(frame, card.id);
  const wrong = difference((check as CubeCheck).rows, drawn, ask.query.ordered === true);
  expect(wrong, `${card.id} / ${ask.check}: ${wrong ?? ''}`).toBeNull();
}

/**
 * Every hint of one card, clicked and checked — the walk the whole page is
 * covered by.
 *
 * Data-driven on purpose: the spec names no hint. A hint added to one of these
 * cubes later is walked here the day it is added, and a hint quietly removed
 * makes `expectHintsAndChecksAgree` red rather than making the walk shorter.
 */
export async function walkEveryHint(frame: Frame, card: CubeCard): Promise<Ask[]> {
  await waitForCard(frame, card.id);
  const { asks, checks } = expectHintsAndChecksAgree(card);

  // The card really offers them, as questions somebody can read and click.
  await expect(inCard(frame, card.id, '#cubeHints .rb-hint')).toHaveCount(asks.length, { timeout: 30_000 });
  for (const ask of asks) {
    await expect(inCard(frame, card.id, `#hint-${ask.id}`)).toContainText(ask.question);
  }

  for (const ask of asks) await checkOneAsk(frame, card, ask, checks);
  return asks;
}

// ── View SQL, View Code, and the shape switch ─────────────────────────────────

export async function openSql(frame: Frame, cubeId: string): Promise<void> {
  const button = inCard(frame, cubeId, '#cubeRuntimeViewSql');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(inCard(frame, cubeId, '#cubeRuntimeSql')).toBeVisible({ timeout: 20_000 });
}

export async function hideSql(frame: Frame, cubeId: string): Promise<void> {
  const button = inCard(frame, cubeId, '#cubeRuntimeViewSql');
  if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
  await expect(inCard(frame, cubeId, '#cubeRuntimeSql')).toHaveCount(0, { timeout: 20_000 });
}

/** The statement the panel is showing, once it has stopped saying it is writing one. */
export async function sqlText(frame: Frame, cubeId: string, timeout = 30_000): Promise<string> {
  const panel = inCard(frame, cubeId, '#cubeRuntimeSql pre');
  await expect(panel).toBeVisible({ timeout });
  await expect
    .poll(async () => ((await panel.textContent()) ?? '').trim().length, { timeout })
    .toBeGreaterThan(0);
  return ((await panel.textContent()) ?? '').trim();
}

/** Choose a database in this card's picker and wait for the statement to change. */
export async function chooseSqlVendor(frame: Frame, cubeId: string, vendor: string): Promise<void> {
  const before = await inCard(frame, cubeId, '#cubeRuntimeSql').textContent();
  await inCard(frame, cubeId, '#cubeRuntimeSqlVendor').selectOption(vendor);
  await expect
    .poll(async () => inCard(frame, cubeId, '#cubeRuntimeSql').textContent(), { timeout: 30_000 })
    .not.toBe(before);
}

export async function openCode(frame: Frame, cubeId: string): Promise<string> {
  const button = inCard(frame, cubeId, '#cubeRuntimeViewCode');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  const panel = inCard(frame, cubeId, '#cubeRuntimeCode pre');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  return ((await panel.textContent()) ?? '').trim();
}

export async function hideCode(frame: Frame, cubeId: string): Promise<void> {
  const button = inCard(frame, cubeId, '#cubeRuntimeViewCode');
  if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
  await expect(inCard(frame, cubeId, '#cubeRuntimeCode')).toHaveCount(0, { timeout: 20_000 });
}

/** The cube's own definition, as the repo holds it — what View Code must be showing. */
export function shippedCubeCode(card: CubeCard): string {
  return fs.readFileSync(
    path.join(SAMPLES_CUBES_PATH, card.domain, `${card.file}-cube-config.groovy`),
    'utf8',
  );
}

// ── The page as a whole ───────────────────────────────────────────────────────

/**
 * The page a visitor lands on: one card per cube, each under its business area,
 * each with its grain line and its component, and a contents list that reaches
 * every one of them.
 */
export async function expectTheWholePage(frame: Frame): Promise<void> {
  await expect(frame.locator('.rb-cube-stories-root')).toBeVisible({ timeout: 60_000 });
  await expect(frame.locator('.rb-cube-stories-root .card')).toHaveCount(CUBE_STORIES_CARDS.length, { timeout: 60_000 });

  for (const card of CUBE_STORIES_CARDS) {
    await expect(cardRoot(frame, card.id), `the ${card.id} card is on the page`).toBeVisible();
    await expect(inCard(frame, card.id, '.card-title')).toHaveText(card.title);
    await expect(frame.locator(`#cube-${card.id}-area`)).toHaveText(card.area);
    await expect(inCard(frame, card.id, '.card-grain')).toContainText('Grain:');
    await expect(frame.locator(`.contents a[href="#cube-${card.id}"]`)).toHaveCount(1);
  }
}

/**
 * No card is showing a warning.
 *
 * The block is drawn only where the parser found something to say, so its
 * absence on every card is the claim that every cube DataPallas ships
 * parses clean — the one claim on this page that is about the cubes rather than
 * about the page.
 */
export async function expectNoCardWarns(frame: Frame): Promise<void> {
  for (const card of CUBE_STORIES_CARDS) {
    await expect(
      inCard(frame, card.id, '#cubeRuntimeWarnings'),
      `the ${card.id} cube parses clean`,
    ).toHaveCount(0);
  }
}

// ── The data, and the link the page is opened by ──────────────────────────────

/** The seed script the Seed Data tab offers as `cube-demo-data`, as text. */
export function cubeDemoSeedScript(): string {
  return fs.readFileSync(CUBE_DEMO_SEED_SCRIPT_PATH, 'utf8');
}

/** One call as the installation's administrator: minting, share links, seeding. */
export type AdminFetch = (url: string, init?: RequestInit) => Promise<globalThis.Response>;

/**
 * Load the cube demo data again, on the day the checks were computed for.
 *
 * The demo data is seeded once, when the installation is made, and its dates
 * are moved to that day — so the same package seeded on a different day
 * answers different months, and a check that names a month would be wrong
 * about a page that is perfectly right. This asks for the data again with
 * `today` pinned, which is what makes every row in `cube-checks` a truth
 * whatever day the run happens on.
 *
 * `run-seed` accepts the script and answers at once; the load itself goes on
 * behind it. So the wait is on the data: the Deals count of the sales-pipeline
 * cube's first check, asked of the live cube until it is the number that check
 * says. While the tables are being dropped and written the question fails or
 * answers the old rows, and both are simply waited through.
 */
export async function reseedCubeDemoData(adminFetch: AdminFetch, baseUrl: string): Promise<void> {
  const accepted = await adminFetch(`${baseUrl}/api/connections/${CUBE_DEMO_CONNECTION}/run-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: cubeDemoSeedScript(), params: CUBE_DEMO_SEED_PARAMS }),
  });
  expect(accepted.status, 'the demo data seed was accepted').toBe(200);
  expect((await accepted.json()).ok, 'the demo data seed was accepted').toBeTruthy();

  const deals = checksOf('sales-pipeline').get('deals-and-value');
  expect(deals, 'the sales-pipeline check says how many deals the demo data holds').toBeTruthy();
  const howManyDeals = Number((deals as CubeCheck).rows[0][0]);

  await expect
    .poll(async () => {
      try {
        const answer = await adminFetch(
          `${baseUrl}/api/reports/${CUBE_STORIES_REPORT_ID}/cube/sales-pipeline/query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimensions: [], measures: ['Deals'] }),
          },
        );
        if (answer.status !== 200) return -1;
        const rows = (await answer.json()).rows ?? [];
        return rows.length === 1 ? Number(Object.values(rows[0] as Record<string, unknown>)[0]) : -1;
      } catch (theSeedIsStillRunning) {
        return -1;
      }
    }, { timeout: 900_000, intervals: [5_000] })
    .toBe(howManyDeals);
}

/**
 * A share link for the Cube Stories page: the only way this spec opens it.
 *
 * With `lockedParams` it is story 25's link - one that answers a question of the page for
 * whoever opens it, signed into the token and therefore not the recipient's to change.
 */
export async function createCubeStoriesShareLink(
  adminFetch: AdminFetch,
  baseUrl: string,
  lockedParams?: Record<string, unknown>,
): Promise<string> {
  const created = await adminFetch(`${baseUrl}/api/embed/share-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: CUBE_STORIES_REPORT_ID,
      ...(lockedParams ? { lockedParams } : {}),
    }),
  });
  expect(created.status, 'a share link for the Cube Stories page').toBe(200);
  const { token } = await created.json();
  expect(token, 'the raw token is returned once, at creation').toBeTruthy();
  return token as string;
}

/** And the link is taken back, so a run leaves nothing that opens anything. */
export async function revokeCubeStoriesShareLinks(adminFetch: AdminFetch, baseUrl: string): Promise<void> {
  const links = await adminFetch(
    `${baseUrl}/api/embed/share-link?reportId=${encodeURIComponent(CUBE_STORIES_REPORT_ID)}`,
  ).then((r) => r.json());
  for (const link of links ?? []) {
    await adminFetch(`${baseUrl}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  }
}
